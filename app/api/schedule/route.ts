import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchTJKProgram, parseBulletinHTML, TJK_CITIES } from '@/lib/tjk-api';

export const maxDuration = 10; // Vercel hobby max

function verifyAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET) return true; // Dev mode
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0]; // "2026-04-18"
  const results: { city: string; status: string; racesCount: number }[] = [];

  try {
    // Try each known city
    const cityPromises = Object.keys(TJK_CITIES).map(async (cityKey) => {
      try {
        const html = await fetchTJKProgram(cityKey, today);
        if (!html || !html.includes('tablesorter')) {
          return { city: cityKey, status: 'no_races', racesCount: 0 };
        }

        const bulletin = parseBulletinHTML(html, cityKey, dateStr);
        if (bulletin.races.length === 0) {
          return { city: cityKey, status: 'no_races', racesCount: 0 };
        }

        // Upsert bulletin
        const { data: bulletinData, error: bulletinError } = await supabase
          .from('bulletins')
          .upsert({
            race_date: dateStr,
            city_key: cityKey,
            city_name: bulletin.cityName,
            city_id: bulletin.cityId,
          }, { onConflict: 'race_date,city_key' })
          .select('id')
          .single();

        if (bulletinError) throw bulletinError;
        const bulletinId = bulletinData.id;

        // Upsert races and horses
        for (const race of bulletin.races) {
          const { data: raceData, error: raceError } = await supabase
            .from('races')
            .upsert({
              bulletin_id: bulletinId,
              race_no: race.raceNo,
              race_name: race.raceName,
              race_time: race.raceTime,
              race_type: race.raceType,
              has_altili: race.hasAltili,
              altili_no: race.altiliNo,
            }, { onConflict: 'bulletin_id,race_no' })
            .select('id')
            .single();

          if (raceError) throw raceError;
          const raceId = raceData.id;

          // Upsert horses
          for (const horse of race.horses) {
            await supabase
              .from('horses')
              .upsert({
                race_id: raceId,
                horse_no: horse.horseNo,
                horse_name: horse.horseName,
                jockey_name: horse.jockeyName,
                last_6_races: horse.last6Races,
              }, { onConflict: 'race_id,horse_no' });
          }
        }

        return { city: cityKey, status: 'ok', racesCount: bulletin.races.length };
      } catch (err) {
        return { city: cityKey, status: `error: ${err}`, racesCount: 0 };
      }
    });

    const settled = await Promise.all(cityPromises);
    results.push(...settled);

    return NextResponse.json({
      success: true,
      date: dateStr,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
