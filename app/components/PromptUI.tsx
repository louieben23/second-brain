"use client";

import { Send } from "lucide-react";
import React, { useState, useRef } from "react";

export default function PromptUI() {
  const [prompt, setPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [results, setResults] = useState<Array<any>>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [hoverChunkId, setHoverChunkId] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);

  function clearHideTimeout() {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }

  function scheduleHideTooltip(delay = 150) {
    clearHideTimeout();
    hideTimeoutRef.current = window.setTimeout(() => {
      setHoverChunkId(null);
      setTooltipPos(null);
      hideTimeoutRef.current = null;
    }, delay) as unknown as number;
  }

  function showTooltip(id: number, e: React.MouseEvent) {
    clearHideTimeout();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setTooltipPos({ x: rect.left, y: rect.top });
    setHoverChunkId(id);
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setIsSending(true);
    try {
      console.log("Prompt sent:", prompt);
      setAnswer(null);
      setResults([]);

  {
        // First fetch search results so we can display matching chunks immediately
        try {
          const sres = await fetch('/api/vector/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: prompt, k: 5 }),
          });
          const sdata = await sres.json();
          if (sres.ok) setResults(Array.isArray(sdata?.results) ? sdata.results : []);
        } catch (e) {
          // non-blocking
          console.error('search preview failed', e);
        }

        // Call streaming endpoint and append chunks as they arrive
        const streamRes = await fetch('/api/vector/answer/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: prompt, k: 5 }),
        });

        if (!streamRes.ok || !streamRes.body) {
          const txt = await streamRes.text();
          console.error('Stream request failed', txt);
          alert('Streaming failed: ' + txt);
        } else {
          const reader = streamRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let headerConsumed = false;
          setAnswer('');

          // Helper to append streamed chunks with basic spacing heuristics
          function appendChunk(chunk: string) {
            // Avoid adding empty strings
            if (!chunk) return;
            setAnswer((prev) => {
              const before = prev ?? '';
              if (before.length === 0) return chunk;

              const lastChar = before.charAt(before.length - 1);
              const firstChar = chunk.charAt(0);

              const lastIsWhitespace = /\s/.test(lastChar);
              const firstIsWhitespace = /\s/.test(firstChar);

              // If either side already has whitespace, just concatenate
              if (lastIsWhitespace || firstIsWhitespace) return before + chunk;

              // If both are alphanumeric letters, assume tokenization omitted space -> insert one
              if (/[A-Za-z0-9]/.test(lastChar) && /[A-Za-z0-9]/.test(firstChar)) {
                return before + ' ' + chunk;
              }

              // Default: just concatenate
              return before + chunk;
            });
          }

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            if (!headerConsumed) {
              const idx = buffer.indexOf('\n\n');
              if (idx !== -1) {
                const headerStr = buffer.slice(0, idx);
                try {
                  const parsed = JSON.parse(headerStr);
                  // if the header included results/stats, show them — but only if the header actually
                  // contains chunk content. The client usually fetches full results first; the server
                  // sends a lightweight header with ids/scores, which should NOT overwrite richer
                  // results fetched earlier. Only use header results if they include `content` fields
                  // and we don't already have results.
                  if (parsed?.header && Array.isArray(parsed.header.results)) {
                    const headerHasContent = parsed.header.results.some((r: any) => typeof r.content === 'string' && r.content.length > 0);
                    if (headerHasContent && (!results || results.length === 0)) {
                      setResults(parsed.header.results);
                    }
                  }
                } catch (e) {
                  // ignore parse errors
                }
                buffer = buffer.slice(idx + 2);
                headerConsumed = true;
                if (buffer) {
                  appendChunk(buffer);
                  buffer = '';
                }
              }
            } else {
              // append incremental text
              appendChunk(buffer);
              buffer = '';
            }
          }
        }

        setPrompt('');
      }
    } catch (err) {
      console.error(err);
      // lightweight feedback
      alert("Failed to send prompt. Check console for details.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="fixed left-0 right-0 bottom-4 flex justify-center px-4 pointer-events-auto"
        aria-label="AI prompt form"
      >
        <div className="w-full max-w-3xl">
          {/* Gradient border outer container to match the provided design */}
          <div className="rounded-2xl p-1 bg-linear-to-r from-pink-400 via-purple-400 to-blue-400 shadow-lg">
            <div className="bg-white/95 dark:bg-zinc-900/95 rounded-xl p-3 flex items-center gap-3 border border-transparent backdrop-blur">
              <div className="flex-1">
                <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">Knowledge based second brain powered by AI</div>
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask me about your notes"
                  className="w-full h-10 bg-transparent outline-none text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  aria-label="Prompt input"
                />
              </div>

              <button
                type="submit"
                disabled={isSending || !prompt.trim()}
                className="ml-2 rounded-md bg-zinc-900 text-white px-4 py-2 text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {isSending ? "Generating..." : "Send"}
                <Send height={16}/>
              </button>
            </div>
          </div>
        </div>
      </form>
      {/* Results area (above the prompt). Shows only the generated answer; chunks list removed per request. */}
      {answer ? (
      <div className="fixed left-0 right-0 bottom-28 flex justify-center px-4 pointer-events-auto">
        <div className="w-full max-w-3xl bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 shadow-md backdrop-blur">
          <div className="text-xs text-zinc-500 mb-1">Answer</div>
          <div className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">
            {/** Render answer with inline citation spans that show tooltips on hover */}
            {renderAnswerWithCitations(answer, results, (id: number, e: React.MouseEvent) => {
              showTooltip(id, e);
            }, () => {
              scheduleHideTooltip();
            })}
          </div>
        </div>
      </div>
      ) : null}

      {/* Tooltip box for hovered chunk */}
      {hoverChunkId != null && tooltipPos ? (
        <div
          style={{ position: 'fixed', left: tooltipPos.x, top: Math.max(8, tooltipPos.y - 120), zIndex: 60 }}
          onMouseEnter={() => clearHideTimeout()}
          onMouseLeave={() => scheduleHideTooltip()}
        >
          <div className="max-w-md bg-white/95 dark:bg-zinc-800/95 text-xs text-zinc-900 dark:text-zinc-100 p-3 rounded border border-zinc-200 dark:border-zinc-700 shadow">
            <div className="font-semibold mb-1">Source: {hoverChunkId}</div>
            <div className="whitespace-pre-wrap">
              {getChunkContentById(results, hoverChunkId) ?? 'No chunk available.'}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// Helpers: render answer text and replace (source: N) occurrences with hoverable spans
function renderAnswerWithCitations(
  answer: string,
  results: Array<any>,
  onEnter: (id: number, e: React.MouseEvent) => void,
  onLeave: () => void
) {
  const nodes: Array<React.ReactNode> = [];
  const regex = /\(source:\s*(\d+)\)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(answer)) !== null) {
    const idx = match.index;
    const idStr = match[1];
    const idNum = Number(idStr);
    if (idx > lastIndex) {
      nodes.push(answer.slice(lastIndex, idx));
    }
    // push span
    nodes.push(
      <span
        key={`src-${idx}-${idNum}`}
        className="text-blue-600 dark:text-blue-400 underline cursor-help"
        onMouseEnter={(e) => onEnter(idNum, e)}
        onMouseLeave={() => onLeave()}
      >
        {`(source: ${idNum})`}
      </span>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < answer.length) nodes.push(answer.slice(lastIndex));
  return nodes;
}

function getChunkContentById(results: Array<any>, id: number) {
  if (!results || !Array.isArray(results)) return null;
  const found = results.find((r) => Number(r.id) === Number(id));
  return found ? (found.content ?? JSON.stringify(found.metadata ?? '')) : null;
}
