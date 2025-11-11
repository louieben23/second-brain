"use client";

import { useState } from "react";

export default function EmbeddingsPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [autoSave, setAutoSave] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  async function loadSample() {
    setLoading(true);
    const res = await fetch("/api/sample");
    const data = await res.json();
    setText(data.text || "");
    setLoading(false);
  }

  async function submit() {
    setLoading(true);
    setResult(null);
    const res = await fetch("/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, metadata: { source: "125.txt" } }),
    });
    const data = await res.json();
    // Keep the full data for autosave but do not expose chunk internals (embeddings/content)
    const raw = data;
    const sanitized = { ...data };
    if (sanitized && Object.prototype.hasOwnProperty.call(sanitized, 'chunks')) {
      // Replace chunks with a high-level summary to avoid showing embeddings/content in the UI
      try {
        sanitized.chunks = (raw.chunks || []).map((c: any, i: number) => ({ index: i, has_embedding: Array.isArray(c?.embedding) && c.embedding.length > 0 }));
        sanitized.chunk_count = Array.isArray(raw.chunks) ? raw.chunks.length : 0;
      } catch (e) {
        sanitized.chunks = undefined;
      }
    }
    setResult(sanitized);
    // Autosave if enabled and chunks present
    if (autoSave && data?.chunks) {
      setSaveStatus('saving');
      try {
        const r = await fetch('/api/embeddings/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunks: data.chunks }),
        });
        const j = await r.json();
        if (j?.saved) setSaveStatus('saved');
        else setSaveStatus('error');
      } catch (e) {
        setSaveStatus('error');
      }
      setTimeout(() => setSaveStatus(null), 3000);
    }
    setLoading(false);
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Embeddings demo</h1>

      <div className="mb-4">
        <button className="mr-2 px-3 py-1 bg-sky-500 text-white rounded" onClick={loadSample}>
          Load sample (125.txt)
        </button>
        <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={submit} disabled={loading || !text}>
          Generate Embeddings
        </button>
        <label className="ml-4 inline-flex items-center">
          <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} className="mr-2" />
          Auto-save results
        </label>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        className="w-full p-2 border rounded mb-4"
      />

      {loading && <div>Processing...</div>}

      {result && (
        <div>
          <h2 className="text-xl font-semibold mt-4">Result</h2>
          <div className="text-sm mt-2 overflow-auto max-h-96 bg-gray-100 p-2">
            {/* Show only a compact summary — do not reveal chunk text or embeddings */}
            <div>Chunks: {result?.chunk_count ?? (result?.chunks ? result.chunks.length : 'unknown')}</div>
            <div>Truncated: {String(result?.truncated ?? false)}</div>
            <pre className="mt-2 text-xs text-gray-600">{JSON.stringify({ ...result, chunks: undefined }, null, 2)}</pre>
          </div>
          {saveStatus === 'saving' && <div className="mt-2">Saving...</div>}
          {saveStatus === 'saved' && <div className="mt-2">Saved ✅</div>}
          {saveStatus === 'error' && <div className="mt-2 text-red-600">Save failed</div>}
        </div>
      )}
    </div>
  );
}
