import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { count, error } = await supabase
      .from('bulletins')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      db_connected: !error,
      total_bulletins: count || 0,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: String(error),
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
