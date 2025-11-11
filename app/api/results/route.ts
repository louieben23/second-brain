import { NextResponse } from "next/server";

export async function GET() {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Fetch recent results from the `results` table. Limit to 20 by default.
    const { data, error } = await supabase
      .from('results')
      .select('id, query, response, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[api/results] supabase error', error);
      return NextResponse.json({ error: String(error) }, { status: 500 });
    }

    return NextResponse.json({ results: data ?? [] });
  } catch (e: any) {
    console.error('[api/results] error', e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
