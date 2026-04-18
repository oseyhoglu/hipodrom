import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchTJKProgram, parseBulletinHTML } from '@/lib/tjk-api';

export const maxDuration = 10;

function verifyAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET) return true;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

// Türkiye saati (UTC+3) cinsinden şimdiki zamanı döndürür
function nowTurkeyMinutes(): number {
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utcMinutes + 180) % (24 * 60); // UTC+3
}

// "HH:MM:SS" veya "HH:MM" formatındaki saat stringini dakikaya çevirir
function timeToMinutes(t: string): number {
  const parts = t.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

export async function GET(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().split('T')[0];
  const nowMin = nowTurkeyMinutes();

  // Çalışma saatleri: 08:45 (525 dk) - 23:59 (1439 dk) TR
  if (nowMin < 525 || nowMin > 1439) {
    return NextResponse.json({ skipped: true, reason: 'outside_hours', nowMin });
  }

  const results: { city: string; status: string; readingsCount: number; reason?: string }[] = [];

  try {
    // Bugünkü bülten + koşu saatlerini çek
    const { data: bulletins, error: bError } = await supabase
      .from('bulletins')
      .select(`id, city_key, city_name, city_id, races(id, race_no, race_time)`)
      .eq('race_date', today);

    if (bError) throw bError;
    if (!bulletins || bulletins.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No bulletins for today. Run /api/schedule first.',
        date: today,
      });
    }

    const bulletinPromises = bulletins.map(async (bulletin) => {
      let readingsCount = 0;
      try {
        // Koşu saatlerini dakikaya çevir
        const races = (bulletin.races as { id: string; race_no: number; race_time: string }[]) || [];
        const upcomingRaceMins = races
          .map(r => timeToMinutes(r.race_time))
          .filter(m => m > nowMin); // henüz başlamamış koşular

        const nextRaceMin = upcomingRaceMins.length > 0 ? Math.min(...upcomingRaceMins) : null;
        const minutesToNext = nextRaceMin !== null ? nextRaceMin - nowMin : 999;

        // Yüksek frekans modu: sonraki koşuya ≤10 dk kaldıysa her çağrıda topla
        const highFreq = minutesToNext <= 10;

        if (!highFreq) {
          // Normal mod: son okumadan bu yana 5 dk geçmediyse atla
          const { data: lastReading } = await supabase
            .from('readings')
            .select('read_time')
            .in(
              'horse_id',
              (await supabase
                .from('horses')
                .select('id')
                .in('race_id', races.map(r => r.id))
              ).data?.map(h => h.id) ?? []
            )
            .order('read_time', { ascending: false })
            .limit(1)
            .single();

          if (lastReading) {
            const lastMin = new Date(lastReading.read_time);
            const diffMs = Date.now() - lastMin.getTime();
            if (diffMs < 5 * 60 * 1000) {
              return { city: bulletin.city_key, status: 'skipped', readingsCount: 0, reason: 'too_soon' };
            }
          }
        }

        // Veri çek
        const html = await fetchTJKProgram(bulletin.city_key, new Date());
        if (!html || !html.includes('tablesorter')) {
          return { city: bulletin.city_key, status: 'no_data', readingsCount: 0 };
        }

        const parsed = parseBulletinHTML(html, bulletin.city_key, today);

        const { data: dbRaces } = await supabase
          .from('races')
          .select('id, race_no')
          .eq('bulletin_id', bulletin.id);

        if (!dbRaces) return { city: bulletin.city_key, status: 'no_races_in_db', readingsCount: 0 };

        const raceMap = new Map(dbRaces.map(r => [r.race_no, r.id]));

        for (const parsedRace of parsed.races) {
          const raceId = raceMap.get(parsedRace.raceNo);
          if (!raceId) continue;

          const { data: horses } = await supabase
            .from('horses')
            .select('id, horse_no')
            .eq('race_id', raceId);

          if (!horses) continue;

          const horseMap = new Map(horses.map(h => [h.horse_no, h.id]));

          const readingsToInsert = parsedRace.horses
            .map(parsedHorse => {
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
                sabit_ganyan: null,
              };
            })
            .filter(Boolean);

          if (readingsToInsert.length > 0) {
            const { error: insertError } = await supabase
              .from('readings')
              .insert(readingsToInsert);

            if (!insertError) readingsCount += readingsToInsert.length;
          }
        }

        return {
          city: bulletin.city_key,
          status: 'ok',
          readingsCount,
          reason: highFreq ? 'high_freq' : 'normal',
        };
      } catch (err) {
        return { city: bulletin.city_key, status: `error: ${err}`, readingsCount: 0 };
      }
    });

    const settled = await Promise.all(bulletinPromises);
    results.push(...settled);

    const totalReadings = results.reduce((sum, r) => sum + r.readingsCount, 0);

    return NextResponse.json({
      success: true,
      date: today,
      totalReadings,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
