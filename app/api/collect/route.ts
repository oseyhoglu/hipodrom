import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchTJKProgram, parseBulletinHTML } from '@/lib/tjk-api';

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
  const results: { city: string; status: string; readingsCount: number }[] = [];

  try {
    // Get today's active bulletins from DB
    const { data: bulletins, error: bError } = await supabase
      .from('bulletins')
      .select('id, city_key, city_name, city_id')
      .eq('race_date', dateStr);

    if (bError) throw bError;
    if (!bulletins || bulletins.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No bulletins found for today. Run /api/schedule first.',
        date: dateStr,
      });
    }

    // For each bulletin, fetch current data and insert readings
    const bulletinPromises = bulletins.map(async (bulletin) => {
      let readingsCount = 0;
      try {
        const html = await fetchTJKProgram(bulletin.city_key, today);
        if (!html || !html.includes('tablesorter')) {
          return { city: bulletin.city_key, status: 'no_data', readingsCount: 0 };
        }

        const parsed = parseBulletinHTML(html, bulletin.city_key, dateStr);

        // Get races for this bulletin
        const { data: races } = await supabase
          .from('races')
          .select('id, race_no')
          .eq('bulletin_id', bulletin.id);

        if (!races) return { city: bulletin.city_key, status: 'no_races_in_db', readingsCount: 0 };

        const raceMap = new Map(races.map(r => [r.race_no, r.id]));

        for (const parsedRace of parsed.races) {
          const raceId = raceMap.get(parsedRace.raceNo);
          if (!raceId) continue;

          // Get horses for this race
          const { data: horses } = await supabase
            .from('horses')
            .select('id, horse_no')
            .eq('race_id', raceId);

          if (!horses) continue;

          const horseMap = new Map(horses.map(h => [h.horse_no, h.id]));

          // Create readings for each horse
          const readingsToInsert = parsedRace.horses
            .map((parsedHorse) => {
              const horseId = horseMap.get(parsedHorse.horseNo);
              if (!horseId) return null;

              return {
                horse_id: horseId,
                read_time: new Date().toISOString(),
                ganyan: parsedHorse.ganyan,
                agf1: parsedHorse.agf1,
                agf1_rank: parsedHorse.agf1Rank,
                agf2: parsedHorse.agf2,
                agf2_rank: parsedHorse.agf2Rank,
                sabit_ganyan: null, // Will be filled when we add sabit ganyan endpoint
              };
            })
            .filter(Boolean);

          if (readingsToInsert.length > 0) {
            const { error: insertError } = await supabase
              .from('readings')
              .insert(readingsToInsert);

            if (insertError) {
              console.error(`Error inserting readings for race ${parsedRace.raceNo}:`, insertError);
            } else {
              readingsCount += readingsToInsert.length;
            }
          }
        }

        return { city: bulletin.city_key, status: 'ok', readingsCount };
      } catch (err) {
        return { city: bulletin.city_key, status: `error: ${err}`, readingsCount: 0 };
      }
    });

    const settled = await Promise.all(bulletinPromises);
    results.push(...settled);

    const totalReadings = results.reduce((sum, r) => sum + r.readingsCount, 0);

    return NextResponse.json({
      success: true,
      date: dateStr,
      totalReadings,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
