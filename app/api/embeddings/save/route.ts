import { NextResponse } from "next/server";
import { saveChunksToSupabase } from "../../../actions/embeddings";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { chunks } = body;

    if (!Array.isArray(chunks)) {
      return NextResponse.json({ error: "Missing 'chunks' array in request body" }, { status: 400 });
    }

    // Build a small preview of incoming chunks for debugging: type and length of embedding
    const preview = chunks.slice(0, 10).map((c: any, i: number) => {
      const emb = c?.embedding;
      const sample = Array.isArray(emb) ? emb.slice(0, 6) : (emb && typeof emb === 'object' ? Object.values(emb).slice(0, 6) : null);
      return {
        index: i,
        has_embedding_field: Object.prototype.hasOwnProperty.call(c, 'embedding'),
        embedding_type: emb === null ? 'null' : Array.isArray(emb) ? 'array' : typeof emb,
        embedding_length: Array.isArray(emb) ? emb.length : (emb && typeof emb === 'object' ? Object.keys(emb).length : null),
        embedding_sample: sample,
      };
    });

    console.log('[embeddings/save] received', chunks.length, 'chunks; preview:', preview);

    const res = await saveChunksToSupabase(chunks);
    return NextResponse.json({ received: { count: chunks.length, preview }, saved: res });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
