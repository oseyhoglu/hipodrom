import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
const supabase = supabaseAdmin;
import { collectForBulletins } from '@/app/api/collect/route';

export const maxDuration = 10;

function verifyAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET) return true;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

function nowTurkeyMinutes(): number {
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utcMinutes + 180) % (24 * 60);
}

function timeToMinutes(t: string): number {
  const parts = t.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

// Dakikada 1 Ã§alÄ±ÅŸÄ±r â€” sadece herhangi bir altÄ±lÄ± baÅŸlangÄ±Ã§ koÅŸusuna â‰¤5 dk kaldÄ±ysa veri Ã§eker
export async function GET(request: Request) {
  if (!verifyAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().split('T')[0];
  const nowMin = nowTurkeyMinutes();

  // Ã‡alÄ±ÅŸma saatleri: 08:45 - 23:59 TR
  if (nowMin < 525 || nowMin > 1439) {
    return NextResponse.json({ skipped: true, reason: 'outside_hours' });
  }

  // AltÄ±lÄ± baÅŸlangÄ±Ã§ koÅŸularÄ±nÄ± olan bÃ¼ltenleri Ã§ek (has_altili = true)
  const { data: bulletins, error } = await supabase
    .from('bulletins')
    .select(`id, city_key, city_name, city_id, races(id, race_no, race_time, has_altili)`)
    .eq('race_date', today);

  if (error || !bulletins || bulletins.length === 0) {
    return NextResponse.json({ skipped: true, reason: 'no_bulletins' });
  }

  // Herhangi bir altÄ±lÄ± baÅŸlangÄ±Ã§ koÅŸusuna â‰¤5 dk kaldÄ± mÄ±?
  const altiliSoonBulletins = bulletins.filter(bulletin => {
    const races = (bulletin.races as { id: string; race_no: number; race_time: string; has_altili: boolean }[]) || [];
    return races.some(r => {
      if (!r.has_altili) return false;
      const raceMin = timeToMinutes(r.race_time);
      const diff = raceMin - nowMin;
      return diff >= 0 && diff <= 5; // 0-5 dakika kaldÄ±
    });
  });

  if (altiliSoonBulletins.length === 0) {
    return NextResponse.json({
      skipped: true,
      reason: 'no_altili_within_5min',
      nowMin,
      checked: bulletins.length,
    });
  }

  // Cooldown: 50 saniye (dakikada 1 Ã§alÄ±ÅŸÄ±rken Ã§ift okumayÄ± Ã¶nler)
  const results = await collectForBulletins(
    altiliSoonBulletins as Parameters<typeof collectForBulletins>[0],
    50 * 1000,
    nowMin
  );

  return NextResponse.json({
    success: true,
    date: today,
    mode: 'altili_high_freq',
    citiesTriggered: altiliSoonBulletins.map(b => b.city_key),
    totalReadings: results.reduce((s, r) => s + r.readingsCount, 0),
    results,
    timestamp: new Date().toISOString(),
  });
}


