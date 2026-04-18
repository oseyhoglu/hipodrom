import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchTJKProgram, parseBulletinHTML, TJK_CITIES, fetchTodayCityList } from '@/lib/tjk-api';

export const maxDuration = 10;

function verifyAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET) return true;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const results: { city: string; status: string; racesCount: number; cityId?: number }[] = [];

  try {
    const todayCities = await fetchTodayCityList();

    const cityPromises = todayCities.map(async ({ cityKey, cityId, cityName: dynamicCityName }) => {
      try {
        const html = await fetchTJKProgram(cityKey, today, cityId);
        if (!html || !html.includes('tablesorter')) {
          return { city: cityKey, status: 'no_races', racesCount: 0, cityId };
        }

        const bulletin = parseBulletinHTML(html, cityKey, dateStr);
        if (bulletin.races.length === 0) {
          return { city: cityKey, status: 'no_races', racesCount: 0, cityId };
        }

        const cityInfo = TJK_CITIES[cityKey];
        const { data: bulletinData, error: bulletinError } = await supabase
          .from('bulletins')
          .upsert({
            race_date: dateStr,
            city_key: cityKey,
            city_name: cityInfo?.name || dynamicCityName,
            city_id: cityId,
          }, { onConflict: 'race_date,city_key' })
          .select('id')
          .single();

        if (bulletinError) throw bulletinError;
        const bulletinId = bulletinData.id;

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

        return { city: cityKey, status: 'ok', racesCount: bulletin.races.length, cityId };
      } catch (err) {
        return { city: cityKey, status: `error: ${err}`, racesCount: 0, cityId };
      }
    });

    const settled = await Promise.all(cityPromises);
    results.push(...settled);

    return NextResponse.json({
      success: true,
      date: dateStr,
      citiesFound: todayCities.map(c => `${c.cityKey}(id=${c.cityId})`),
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
