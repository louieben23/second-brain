import { NextResponse } from "next/server";

// Fetch a single chunk by id from the `chunks` table in Supabase
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id } = body;
    if (id == null) return NextResponse.json({ error: "Missing 'id' in request body" }, { status: 400 });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return NextResponse.json({ error: "Supabase not configured (SUPABASE_URL / key missing)" }, { status: 500 });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data, error } = await supabase.from("chunks").select("id, content, metadata").eq("id", id).maybeSingle();
    if (error) {
      console.error('[vector/chunk] supabase error', error);
      return NextResponse.json({ error: String(error) }, { status: 500 });
    }

    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ id: data.id, content: data.content ?? null, metadata: data.metadata ?? null });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
