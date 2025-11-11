"use server";

// Lightweight chunking utility: splits by sentences then by token-like length
// Default maxChars set to 500 so accidental callers without an explicit
// limit won't produce very large chunks. The function guarantees no chunk
// will exceed `maxChars` by hard-splitting and a final clamp pass.
function chunkText(text: string, maxChars = 500) {
  if (!text) return [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const s of sentences) {
    if ((current + " " + s).length > maxChars) {
      if (current) chunks.push(current.trim());
      if (s.length > maxChars) {
        // hard split long sentence into exact-size pieces
        for (let i = 0; i < s.length; i += maxChars) {
          const slice = s.slice(i, Math.min(i + maxChars, s.length)).trim();
          if (slice) chunks.push(slice);
        }
        current = "";
      } else {
        current = s;
      }
    } else {
      current = (current + " " + s).trim();
    }
  }
  if (current) chunks.push(current.trim());
  // Final clamp: ensure no chunk exceeds maxChars (defensive - should be unnecessary)
  const clamped: string[] = [];
  for (const c of chunks) {
    if (c.length <= maxChars) {
      clamped.push(c);
      continue;
    }
    for (let i = 0; i < c.length; i += maxChars) {
      const slice = c.slice(i, Math.min(i + maxChars, c.length)).trim();
      if (slice) clamped.push(slice);
    }
  }
  return clamped;
}

// Simple type for metadata
type Metadata = Record<string, any>;

// --- new helpers: timeout and safeLimit
function timeoutPromise<T>(ms: number, message = "Timeout"): Promise<T> {
  return new Promise<T>((_, rej) => setTimeout(() => rej(new Error(message)), ms));
}

// Server action: takes text and metadata, returns embeddings per chunk using
// @huggingface/transformers feature-extraction pipeline with the
// sentence-transformers/all-MiniLM-L6-v2 model.
export async function generateEmbeddings(
  text: string,
  metadata: Metadata = {}
) {
  console.log("[embeddings] start generateEmbeddings");
  // smaller chunk size for more granular retrieval
  const allChunks = chunkText(text, 500);

  // Cap number of chunks in dev so long inputs don't hang the server.
  const MAX_CHUNKS = 12;
  const chunks = allChunks.slice(0, MAX_CHUNKS);
  if (allChunks.length > MAX_CHUNKS) {
    console.warn(`[embeddings] input produced ${allChunks.length} chunks; limiting to ${MAX_CHUNKS} in dev`);
  }

  // Try to load a local pipeline. If this fails we surface the error so you can
  // fix the local environment (no HF_API_KEY fallback here — you said you want local-only).
  let embedder: any = null;
  try {
    console.log("[embeddings] importing @huggingface/transformers pipeline (this may download model files)...");
    // Give the import + pipeline up to 30s before failing to avoid indefinite hangs
    const imp = import("@huggingface/transformers");
    const loaded: any = await Promise.race([imp, timeoutPromise(30000, "Import/pipeline timeout")]);
    const pipelineFn = loaded.pipeline;
    if (!pipelineFn) throw new Error("pipeline factory not found on @huggingface/transformers import");

    console.log("[embeddings] creating pipeline... (may download model)");
    // allow pipeline creation up to 60s
    embedder = await Promise.race([
      pipelineFn("feature-extraction", "sentence-transformers/all-MiniLM-L6-v2"),
      timeoutPromise(60000, "Pipeline creation timeout"),
    ]);
    console.log("[embeddings] pipeline ready");
  } catch (err: any) {
    // Provide a clear actionable error for local-only runs.
    const msg =
      `Local model load failed: ${String(err)}. To run locally ensure @huggingface/transformers is installed and the model files are valid. Try removing the model cache and re-downloading:\n\n` +
      `rm -rf node_modules/@huggingface/transformers/.cache/sentence-transformers/all-MiniLM-L6-v2\nnpm install\n` +
      `\nIf the error persists, the ONNX/protobuf binary may be incompatible with your environment. See dev server logs for details.`;
    console.error("[embeddings] model load error:", err);
    throw new Error(msg);
  }

  const results: Array<{ chunk: string; embedding: number[]; metadata: Metadata }> = [];

  // Embed each chunk with a per-chunk timeout (e.g. 20s)
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    console.log(`[embeddings] embedding chunk ${i + 1}/${chunks.length} (len=${c.length})`);
    try {
      const out: any = await Promise.race([
        embedder(c),
        timeoutPromise(20000, `Embedding timeout for chunk ${i + 1}`),
      ]);

      let vector: number[] = [];

      if (!out) {
        vector = [];
      } else if (Array.isArray(out)) {
        // Could be number[] or number[][] (tokens x dim). If tokens x dim, average.
        if (Array.isArray(out[0])) {
          const arrs = out as number[][];
          const dim = arrs[0].length;
          vector = new Array(dim).fill(0).map((_, j) => arrs.reduce((s, a) => s + a[j], 0) / arrs.length);
        } else {
          vector = out as number[];
        }
      } else if ((out as any).data) {
        vector = (out as any).data as number[];
      } else {
        vector = [];
      }

        // Additional coercion: some runtimes return object-like embeddings (numeric keys) or typed arrays serialized as objects.
        // Try to coerce those into plain arrays and re-run pooling logic if necessary.
        function objToArray(obj: any): any[] | null {
          if (obj == null) return null;
          if (Array.isArray(obj)) return obj;
          // Typed array view
          try {
            if (ArrayBuffer.isView(obj)) return Array.from(obj as any).map((v: any) => Number(v));
          } catch {}
          // Object with numeric keys { '0': val, '1': val }
          const keys = Object.keys(obj || {});
          const numKeys = keys.filter((k) => String(Number(k)) === k);
          if (numKeys.length > 0) {
            numKeys.sort((a, b) => Number(a) - Number(b));
            return numKeys.map((k) => Number((obj as any)[k]));
          }
          return null;
        }

        if ((!vector || vector.length === 0) && out) {
          // attempt coercion from out or out.data
          const candidate = (out as any).data ?? out;
          const coerced = objToArray(candidate);
          if (coerced) {
            // if coerced is array of arrays (tokens x dim)
            if (Array.isArray(coerced[0])) {
              const arrs = coerced as number[][];
              const dim = arrs[0].length;
              vector = new Array(dim).fill(0).map((_, j) => arrs.reduce((s, a) => s + a[j], 0) / arrs.length);
            } else {
              vector = (coerced as any).map((v: any) => Number(v));
            }
          }
        }

      results.push({ chunk: c, embedding: vector, metadata });
      console.log(`[embeddings] done chunk ${i + 1}`);
    } catch (e: any) {
      console.error(`[embeddings] failed chunk ${i + 1}:`, e);
      // push a placeholder so the client knows how many were attempted
      results.push({ chunk: c, embedding: [], metadata: { ...metadata, _error: String(e) } });
    }
  }

  console.log("[embeddings] finished, returning results");
  return { chunks: results, truncated: allChunks.length > MAX_CHUNKS ? true : false };
}

// Exported helper to save chunk rows to Supabase `chunks` table.
// Accepts an array of rows with fields: { chunk, embedding, metadata, source, chunk_index }
export async function saveChunksToSupabase(rows: Array<Record<string, any>>) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      const msg = '[embeddings] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set; skipping DB save';
      console.log(msg);
      return { skipped: true, reason: msg, rows: rows.length };
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const BATCH = 50;
  const summary: { inserted: number; errors: any[]; rows: Array<any> } = { inserted: 0, errors: [], rows: [] };

    // Helper: normalize embedding into a plain number[] so pgvector receives a JSON array
    function normalizeEmbedding(e: any): number[] | null {
      if (e == null) return null;
      // plain arrays
      if (Array.isArray(e)) return e.map((v) => Number(v));
      // Typed arrays (Float32Array, etc.)
      if (ArrayBuffer.isView(e)) return Array.from(e as any).map((v) => Number(v));
      // string that might be a JSON array
      if (typeof e === 'string') {
        try {
          const parsed = JSON.parse(e);
          if (Array.isArray(parsed)) return parsed.map((v) => Number(v));
        } catch {
          // fallthrough
        }
      }
      // object-like serialization { '0': val, '1': val }
      if (typeof e === 'object') {
        const keys = Object.keys(e).filter((k) => String(Number(k)) === k).sort((a, b) => Number(a) - Number(b));
        if (keys.length > 0) return keys.map((k) => Number((e as any)[k]));
      }
      return null;
    }

    // Map incoming rows to table columns: content, embedding, metadata
  // choose a target embedding dimension to store in pgvector
  // default to 384 (common for SBERT models) but allow override via env
  const TARGET_DIM = process.env.SUPABASE_VECTOR_DIM ? Number(process.env.SUPABASE_VECTOR_DIM) : 384;

    const mapped = rows.map((r) => {
      const normalized = normalizeEmbedding(r.embedding);
      const meta = r.metadata ?? {};

      if (!normalized) {
        return { content: r.chunk ?? r.content ?? null, embedding: null, metadata: meta };
      }

      // If the embedding is longer than TARGET_DIM, store the full vector in metadata.embedding_raw
      // and store a truncated prefix in the vector column so pgvector can accept it.
      if (normalized.length > TARGET_DIM) {
        meta.embedding_raw = normalized;
        const truncated = normalized.slice(0, TARGET_DIM).map((v) => Number(v));
        return { content: r.chunk ?? r.content ?? null, embedding: truncated, metadata: meta };
      }

      // If embedding is shorter than TARGET_DIM, pad with zeros so pgvector receives expected dimension
      if (normalized.length < TARGET_DIM) {
        const nums = normalized.map((v) => Number(v));
        const pad = new Array(TARGET_DIM - nums.length).fill(0);
        return { content: r.chunk ?? r.content ?? null, embedding: nums.concat(pad), metadata: meta };
      }

      // normal case: embedding fits exactly
      return { content: r.chunk ?? r.content ?? null, embedding: normalized.map((v) => Number(v)), metadata: meta };
    });

    console.log(`[embeddings] saving ${mapped.length} rows to Supabase (table chunks)`);

    for (let i = 0; i < mapped.length; i += BATCH) {
      const batch = mapped.slice(i, i + BATCH);
      // attach diagnostics per row before insert
      batch.forEach((b, idx) => summary.rows.push({ index: i + idx, embedding_len: Array.isArray(b.embedding) ? b.embedding.length : null, embedding_present: !!b.embedding }));

      const { data, error } = await supabase.from('chunks').insert(batch).select();
      if (error) {
        console.error('[embeddings] supabase insert error', error);
        summary.errors.push({ error, batch_start: i, batch_len: batch.length });
      } else {
        summary.inserted += Array.isArray(data) ? data.length : (data ? 1 : 0);
        // mark successful inserted indices
        const insertedCount = Array.isArray(data) ? data.length : (data ? 1 : 0);
        for (let j = 0; j < insertedCount; j++) {
          const rowDiag = summary.rows[i + j];
          if (rowDiag) rowDiag.inserted = true;
        }
      }
    }

    return summary;
  } catch (e: any) {
  console.error('[embeddings] failed to save to supabase', e);
  return { error: String(e), rows: rows.length };
  }
}
