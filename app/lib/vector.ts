"use server";

import { generateEmbeddings } from "../actions/embeddings";

// Lightweight supabase-based vector search utility with a safe fallback.
// - If SUPABASE_URL and a key are set, will fetch rows from `chunks` table and perform
//   a local nearest-neighbor sort (small datasets). This avoids relying on DB-side
//   stored procedures so it works on most Supabase setups.
// - Returns top K rows with score (cosine similarity) and original metadata.

type ChunkRow = { id?: string | number; content?: string | null; embedding?: any; metadata?: any };

function normalizeEmbedding(e: any): number[] | null {
  if (e == null) return null;
  if (Array.isArray(e)) return e.map((v) => Number(v));
  if (typeof e === "string") {
    try {
      const parsed = JSON.parse(e);
      if (Array.isArray(parsed)) return parsed.map((v) => Number(v));
    } catch {}
  }
  try {
    if (ArrayBuffer.isView(e)) return Array.from(e as any).map((v) => Number(v));
  } catch {}
  if (typeof e === "object") {
    const keys = Object.keys(e).filter((k) => String(Number(k)) === k).sort((a, b) => Number(a) - Number(b));
    if (keys.length > 0) return keys.map((k) => Number((e as any)[k]));
  }
  return null;
}

function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(a: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s) || 1e-12;
}

function cosineSim(a: number[], b: number[]) {
  if (!a || !b) return -1;
  if (a.length !== b.length) return -1;
  return dot(a, b) / (norm(a) * norm(b));
}

// Exported search function
export async function searchVectorStore(query: string, topK = 5) {
  if (!query || typeof query !== "string") return { error: "query missing" };

  // create a single embedding for the query using existing generator
  const gen = await generateEmbeddings(query, {});
  const qEmb = gen?.chunks && Array.isArray(gen.chunks) && gen.chunks[0] ? normalizeEmbedding(gen.chunks[0].embedding) : null;
  if (!qEmb) return { error: "failed to generate query embedding" };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { error: "Supabase not configured (SUPABASE_URL / key missing)" };
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // Fetch candidate rows that have embeddings. We limit to a modest batch to avoid huge downloads.
    // If your dataset grows, replace this with a DB-side nearest-neighbor function or materialized RPC.
    const { data, error } = await supabase
      .from("chunks")
      .select("id, content, metadata, embedding")
      .limit(1000);

    if (error) {
      console.error("[vector] supabase fetch error", error);
      return { error: String(error) };
    }

      const fetched = (data as any[] || []);

      // normalize and attempt to recover embeddings from metadata.embedding_raw when needed
      const rows = fetched.map((r) => {
        const embCandidate = r.embedding ?? (r.metadata && r.metadata.embedding_raw ? r.metadata.embedding_raw : null);
        return { id: r.id, content: r.content, metadata: r.metadata, embedding: normalizeEmbedding(embCandidate) } as ChunkRow;
      });

      const stats = {
        fetched: fetched.length,
        with_embedding: rows.filter((r) => Array.isArray(r.embedding) && r.embedding.length > 0).length,
      };

      // compute similarity and sort — tolerate dimension mismatches by trimming or padding stored vector
      const scored = rows
        .map((r) => {
          const emb = r.embedding as number[] | null;
          if (!Array.isArray(emb) || emb.length === 0) return { ...r, score: -1 };

          // If embedding dims differ, trim or pad to match query embedding length
          let aligned: number[] = emb;
          if (emb.length !== qEmb.length) {
            if (emb.length > qEmb.length) {
              aligned = emb.slice(0, qEmb.length);
            } else {
              // pad with zeros
              aligned = emb.concat(new Array(qEmb.length - emb.length).fill(0));
            }
          }

          return { ...r, score: cosineSim(qEmb, aligned) };
        })
        .filter((r) => typeof r.score === "number" && r.score > -1)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      return { query, topK, stats, results: scored };
  } catch (e: any) {
    console.error("[vector] search failed", e);
    return { error: String(e) };
  }
}

export type SearchResult = Awaited<ReturnType<typeof searchVectorStore>>;
