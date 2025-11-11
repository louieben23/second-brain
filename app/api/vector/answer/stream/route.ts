import { NextResponse } from "next/server";
import { searchVectorStore } from "../../../../lib/vector";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query, k } = body;
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: "Missing 'query' string in request body" }, { status: 400 });
    }

    const topK = typeof k === 'number' && k > 0 ? k : 5;

    const searchRes = await searchVectorStore(query, topK);
    if ((searchRes as any).error) {
      return NextResponse.json({ error: (searchRes as any).error }, { status: 500 });
    }

    const results = (searchRes as any).results ?? [];
    const stats = (searchRes as any).stats ?? null;

    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    // Prepare a small metadata header to send first to the client (so UI can render results immediately)
    const header = { query, topK, stats, results: results.map((r: any) => ({ id: r.id, score: r.score })) };

    // If OpenAI not configured, return header only as a small stream
    if (!OPENAI_KEY) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(JSON.stringify({ header }) + '\n\n'));
          controller.close();
        },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // Build system and user prompts that encourage synthesis (generate new text) while using context
    const contextPieces = (results as any[]).map((r, i) => `---\nsource: ${r.id ?? i}\nscore: ${typeof r.score === 'number' ? r.score.toFixed(4) : 'n/a'}\ncontent: ${r.content ?? ''}\n`);
    const contextText = contextPieces.join('\n');

    const systemPrompt = `You are a helpful assistant. Use the provided context to answer the user question. Synthesize a new, original answer—do not simply copy long passages verbatim from the context. You may quote short excerpts (under ~50 characters) for clarity but prefer paraphrasing. When stating facts that come from the context, cite the source id in parentheses like (source: 123). If the context doesn't contain an answer, be honest and say you don't know.`;

    const userPrompt = `Question: ${query}\n\nContext:\n${contextText}\n\nPlease synthesize a clear answer using the context. Generate new explanatory text and cite sources inline where useful.`;

    const payload: any = {
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini-2024-07-18',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 800,
      temperature: 0.2,
      stream: true,
    };

    const openRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!openRes.ok || !openRes.body) {
      const txt = await openRes.text();
      console.error('[vector/answer/stream] OpenAI error', txt);
      return NextResponse.json({ error: 'OpenAI API error', detail: txt }, { status: 500 });
    }

    const encoder = new TextEncoder();

    // Create a ReadableStream that first sends header JSON then streams token deltas from OpenAI
    const stream = new ReadableStream({
      async start(controller) {
        // send header first
        controller.enqueue(encoder.encode(JSON.stringify({ header }) + '\n\n'));

        const reader = openRes.body!.getReader();
        const decoder = new TextDecoder();
        let done = false;
        // Buffer text to handle SSE events that may be split across reads
        let sseBuffer = '';

        try {
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            if (readerDone) break;
            sseBuffer += decoder.decode(value, { stream: true });

            // Extract complete SSE events separated by \n\n
            let idx;
            while ((idx = sseBuffer.indexOf('\n\n')) !== -1) {
              const eventBlock = sseBuffer.slice(0, idx);
              sseBuffer = sseBuffer.slice(idx + 2);

              // An eventBlock may contain multiple lines like: data: {...}\n
              const lines = eventBlock.split(/\n/).filter(Boolean);
              for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const payload = line.replace(/^data:\s*/, '');
                if (payload === '[DONE]') {
                  done = true;
                  break;
                }
                try {
                  const parsed = JSON.parse(payload);
                  const deltaContent = parsed?.choices?.[0]?.delta?.content;
                  if (typeof deltaContent === 'string' && deltaContent.length > 0) {
                    controller.enqueue(encoder.encode(deltaContent));
                  }
                } catch (e) {
                  // ignore parse errors for this event
                }
              }
              if (done) break;
            }
          }
          // Process any remaining buffer after stream end
          if (!done && sseBuffer.length > 0) {
            const remainingLines = sseBuffer.split(/\n/).filter(Boolean);
            for (const line of remainingLines) {
              if (!line.startsWith('data:')) continue;
              const payload = line.replace(/^data:\s*/, '');
              if (payload === '[DONE]') {
                done = true;
                break;
              }
              try {
                const parsed = JSON.parse(payload);
                const deltaContent = parsed?.choices?.[0]?.delta?.content;
                if (typeof deltaContent === 'string' && deltaContent.length > 0) {
                  controller.enqueue(encoder.encode(deltaContent));
                }
              } catch (e) {
                // ignore
              }
            }
          }
        } catch (e) {
          console.error('[vector/answer/stream] stream read error', e);
        } finally {
          controller.close();
          try { reader.releaseLock(); } catch {}
        }
      },
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
