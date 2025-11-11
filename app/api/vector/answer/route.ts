import { NextResponse } from "next/server";
import { searchVectorStore } from "../../../lib/vector";

type AnswerRequest = { query: string; k?: number };

export async function POST(req: Request) {
  try {
    const body: AnswerRequest = await req.json();
    const { query, k } = body;
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Missing 'query' string in request body" }, { status: 400 });
    }

    const topK = typeof k === "number" && k > 0 ? k : 5;

    // Search the vector store
    const searchRes = await searchVectorStore(query, topK);
    if ((searchRes as any).error) {
      return NextResponse.json({ error: (searchRes as any).error }, { status: 500 });
    }

    const results = (searchRes as any).results ?? [];

    // Build context from top results
    const contextPieces = (results as any[]).map((r, i) => `---
source: ${r.id ?? i}
score: ${typeof r.score === 'number' ? r.score.toFixed(4) : 'n/a'}
content: ${r.content ?? ''}
`);

    const contextText = contextPieces.join("\n");

    // If OpenAI key is available, call OpenAI to synthesize an answer from context
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) {
      // Return the retrieved chunks so the client can render them; no LLM answer available.
      return NextResponse.json({ query, topK, stats: (searchRes as any).stats ?? null, results, answer: null, note: 'OPENAI_API_KEY not configured on server' });
    }

    const systemPrompt = `You are a helpful assistant. Use the provided context to answer the user question. If the context doesn't contain an answer, be honest and say you don't know. Keep the answer concise and include brief references to the sources when relevant.`;

    const userPrompt = `Question: ${query}\n\nContext:\n${contextText}\n\nAnswer concisely using the context and cite source ids where useful.`;

    // Call OpenAI Chat Completions
    const payload = {
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini-2024-07-18',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 512,
      temperature: 0.2,
    };

    const openRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!openRes.ok) {
      const txt = await openRes.text();
      console.error('[vector/answer] OpenAI error', txt);
      return NextResponse.json({ error: 'OpenAI API error', detail: txt }, { status: 500 });
    }

    const openData = await openRes.json();
    const answer = openData?.choices?.[0]?.message?.content ?? null;

    return NextResponse.json({ query, topK, stats: (searchRes as any).stats ?? null, results, answer });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
