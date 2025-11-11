import { NextResponse } from "next/server";
import { saveChunksToSupabase, generateEmbeddings } from "../../../actions/embeddings";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { chunks } = body;

    if (!Array.isArray(chunks)) {
      return NextResponse.json({ error: "Missing 'chunks' array in request body" }, { status: 400 });
    }

    // Ensure each chunk has an embedding. If missing, generate one from the chunk content.
    const rowsToSave = [] as Array<any>;

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const row = { ...c };
      let pushed = false;

      // If embedding is missing or empty, attempt to generate it using the embeddings action
      if (!row.embedding || (Array.isArray(row.embedding) && row.embedding.length === 0)) {
        try {
          // generateEmbeddings accepts text and returns { chunks: [...] }
          const text = row.chunk ?? row.content ?? "";
          if (text && typeof text === 'string') {
            const gen = await generateEmbeddings(text, row.metadata ?? {});
            // If we got at least one chunk back, expand into separate rows so a single
            // long document becomes multiple DB rows rather than only using the first
            if (gen?.chunks && Array.isArray(gen.chunks) && gen.chunks.length > 0) {
              if (gen.chunks.length === 1) {
                // single generated chunk: normalize content and embedding
                row.embedding = gen.chunks[0].embedding ?? [];
                row.chunk = gen.chunks[0].chunk ?? row.chunk;
                // keep metadata returned by generator if any
                row.metadata = { ...(row.metadata ?? {}), ...(gen.chunks[0].metadata ?? {}) };
                rowsToSave.push(row);
                pushed = true;
              } else {
                // multiple chunks: create a row per generated chunk
                for (let k = 0; k < gen.chunks.length; k++) {
                  const g = gen.chunks[k];
                  const newRow = {
                    // keep original row-level fields but replace content with generated chunk
                    ...row,
                    chunk: g.chunk ?? row.chunk,
                    content: g.chunk ?? row.content,
                    embedding: g.embedding ?? [],
                    metadata: { ...(row.metadata ?? {}), ...(g.metadata ?? {}), chunk_index: k },
                  };
                  rowsToSave.push(newRow);
                }
                pushed = true;
              }
            } else {
              row.embedding = [];
            }
          } else {
            row.embedding = [];
          }
        } catch (e: any) {
          console.error('[embeddings/save] failed to generate embedding for row', i, e);
          row.embedding = [];
        }
      }

      // If we didn't already push an expanded set of rows above, push the (possibly
      // unchanged) original row so it still gets saved.
      if (!pushed) rowsToSave.push(row);
    }

    // Build a small preview of incoming chunks for debugging: presence and length of embedding (no samples)
    const preview = rowsToSave.slice(0, 10).map((c: any, i: number) => {
      const emb = c?.embedding;
      return {
        index: i,
        has_embedding_field: Object.prototype.hasOwnProperty.call(c, 'embedding'),
        embedding_type: emb === null ? 'null' : Array.isArray(emb) ? 'array' : typeof emb,
        embedding_length: Array.isArray(emb) ? emb.length : (emb && typeof emb === 'object' ? Object.keys(emb).length : null),
      };
    });

    console.log('[embeddings/save] received', rowsToSave.length, 'chunks; preview:', preview);

    const res = await saveChunksToSupabase(rowsToSave);
    return NextResponse.json({ received: { count: chunks.length, preview }, saved: res });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
