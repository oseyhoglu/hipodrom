import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 10;

function verifyAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET) return true;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

// Her gece 00:30 TR (21:30 UTC) çalışır — önceki günlerin verilerini temizler
export async function GET(request: Request) {
  if (!verifyAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().split('T')[0];

  const { error, count } = await supabaseAdmin
    .from('bulletins')
    .delete({ count: 'exact' })
    .lt('race_date', today);

  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });

  return NextResponse.json({
    success: true,
    message: `${today} tarihinden önceki bültenler silindi (cascade: races, horses, readings)`,
    deletedCount: count,
    timestamp: new Date().toISOString(),
  });
}

