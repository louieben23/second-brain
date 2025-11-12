"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import NoteSidebar from "./NoteSidebar";

export default function SideNav() {
  const pathname = usePathname() || "/";
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<Array<{ id: number; query: string; response?: string; created_at?: string }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selected, setSelected] = useState<{ id: number; query: string; response?: string } | null>(null);
  const [resultsForSelected, setResultsForSelected] = useState<Array<any>>([]);
  const [isLoadingSelectedResults, setIsLoadingSelectedResults] = useState(false);

  // tooltip state for source hover (reused from PromptUI)
  const [hoverChunkId, setHoverChunkId] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const chunkCacheRef = useRef<Record<number, { content: string | null; metadata?: any }>>({});
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

    // If not cached, fetch chunk content from the server
    const cached = chunkCacheRef.current[Number(id)];
    if (!cached) {
      (async () => {
        try {
          const res = await fetch('/api/vector/chunk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          });
          const j = await res.json();
          if (res.ok && (j?.content != null || j?.metadata != null)) {
            chunkCacheRef.current[Number(id)] = { content: j.content ?? null, metadata: j.metadata ?? null };
            // force rerender if tooltip for this id is open
            setHoverChunkId((cur) => (cur === id ? id : cur));
          } else {
            console.error('Failed to fetch chunk', j);
            chunkCacheRef.current[Number(id)] = { content: null };
          }
        } catch (err) {
          console.error('Error fetching chunk', err);
          chunkCacheRef.current[Number(id)] = { content: null };
        }
      })();
    }
  }

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch('/api/results');
      const j = await res.json();
      if (res.ok && j?.results) setHistory(j.results);
      else console.error('Failed to load history', j);
    } catch (e) {
      console.error('Error fetching history', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void fetchHistory();
  }, []);

  useEffect(() => {
    const handler = (e: any) => {
      try {
        const results = e?.detail;
        if (Array.isArray(results)) setHistory(results);
      } catch (err) {
        console.error('history update handler error', err);
      }
    };
    window.addEventListener('history:updated', handler as EventListener);
    return () => window.removeEventListener('history:updated', handler as EventListener);
  }, []);

  // Open modal for a history item. Also fetch latest vector search results for the query
  const openHistory = async (item: { id: number; query: string; response?: string }) => {
    setSelected(item);
    setResultsForSelected([]);
    setIsLoadingSelectedResults(true);
    try {
      const res = await fetch('/api/vector/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: item.query, k: 5 }),
      });
      const j = await res.json();
      if (res.ok && Array.isArray(j?.results)) setResultsForSelected(j.results);
      else console.error('Failed to fetch search for history modal', j);
    } catch (e) {
      console.error('Error fetching search for history modal', e);
    } finally {
      setIsLoadingSelectedResults(false);
    }
  };

  const closeModal = () => {
    setSelected(null);
    setResultsForSelected([]);
    setHoverChunkId(null);
    setTooltipPos(null);
  };

  // helpers copied/adapted from PromptUI to render citations and map ids -> content
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

  const baseLinkClass = "block px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-neutral-800";

  const getClass = (href: string) => {
    const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return `${baseLinkClass} ${isActive ? "bg-gray-200 dark:bg-neutral-800 font-semibold" : ""}`;
  };

  return (
    <>
      <nav className="w-56 h-screen px-4 py-6 bg-[#f7f7f7]">
        <div className="mb-6">
          {/* <Link
            href="/"
            className="text-md font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent"
          >
            My Second Brain
          </Link> */}

          {/* User avatar / name / badge */}
          <div className="mt-4 flex items-center space-x-3">
            <div
              className="w-12 h-12 rounded-full bg-linear-to-r from-green-400 to-blue-500 flex items-center justify-center text-white font-semibold"
              aria-hidden="true"
            >
              JD
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-white">John Doe</span>
              <span className="mt-1 text-xs inline-block   rounded-full bg-yellow-100 text-yellow-800 font-semibold">Premium</span>
            </div>
          </div>
        </div>
        <ul className="space-y-2">
          <li>
            <Link href="/" className={getClass("/")}> 
              Search Knowledge
            </Link>
          </li>
          <li>
            {/* Use a button to open the sidebar. Prevent navigation so we open an in-place sidebar instead of routing. */}
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className={getClass("/embeddings")}
            >
              Take a Note
            </button>
          </li>
        </ul>
        {/* History shown under the Take a Note item */}
        <div className="mt-4">
          <h4 className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">History</h4>
          <div className="space-y-2 max-h-800 overflow-auto">
            {loadingHistory && <div className="text-xs text-gray-500">Loading...</div>}
            {!loadingHistory && history.length === 0 && <div className="text-xs text-gray-500">No history yet</div>}
            {!loadingHistory && history.map((h) => (
              <button
                key={h.id}
                onClick={() => openHistory(h)}
                className="w-full text-left p-2 border rounded bg-white dark:bg-neutral-900 border-gray-100 dark:border-neutral-700 text-xs"
              >
                <div className="font-medium text-sm text-gray-800 dark:text-white">{h.query}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{h.response ?? ''}</div>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <NoteSidebar open={isOpen} onClose={() => setIsOpen(false)} />

      {/* Modal for selected history item */}
      {selected ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative max-w-3xl w-full bg-white dark:bg-neutral-900 rounded-lg shadow-lg p-4 z-70">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selected.query}</h3>
                <div className="text-xs text-gray-500 dark:text-gray-400">Saved prompt</div>
              </div>
              <button onClick={closeModal} className="text-gray-500">✕</button>
            </div>

            <div className="mt-3">
              <div className="text-xs text-gray-500 mb-1">Response</div>
              <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                {selected.response ? (
                  renderAnswerWithCitations(selected.response, resultsForSelected, (id, e) => showTooltip(id, e), () => scheduleHideTooltip())
                ) : (
                  <div className="text-xs text-gray-500">No response saved.</div>
                )}
              </div>
            </div>

            {hoverChunkId != null && tooltipPos ? (
              <div
                style={{ position: 'fixed', left: tooltipPos.x, top: Math.max(8, tooltipPos.y - 120), zIndex: 1000 }}
                onMouseEnter={() => clearHideTimeout()}
                onMouseLeave={() => scheduleHideTooltip()}
              >
                <div className="max-w-md bg-white/95 dark:bg-zinc-800/95 text-xs text-zinc-900 dark:text-zinc-100 p-3 rounded border border-zinc-200 dark:border-zinc-700 shadow">
                  <div className="font-semibold mb-1">Source: {hoverChunkId}</div>
                  <div className="whitespace-pre-wrap">
                      {(() => {
                        const cached = hoverChunkId != null ? chunkCacheRef.current[Number(hoverChunkId)] : null;
                        if (cached && cached.content != null) return cached.content;
                        // fallback to resultsForSelected when available
                        const fromResults = hoverChunkId != null ? getChunkContentById(resultsForSelected, hoverChunkId) : null;
                        return fromResults ?? 'No chunk available.';
                      })()}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-4 text-right">
              <button onClick={closeModal} className="px-3 py-1 rounded bg-gray-100 dark:bg-neutral-800">Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
