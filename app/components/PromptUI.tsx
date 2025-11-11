"use client";

import React, { useState } from "react";

export default function PromptUI() {
  const [prompt, setPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setIsSending(true);
    try {
      // Placeholder: send prompt to an API when available.
      // For now, just log it so the UI is functional.
      console.log("Prompt sent:", prompt);
      // Example for future integration:
      // await fetch('/api/your-endpoint', { method: 'POST', body: JSON.stringify({ prompt }) })
      setPrompt("");
    } catch (err) {
      console.error(err);
      // lightweight feedback
      alert("Failed to send prompt. Check console for details.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="fixed left-0 right-0 bottom-4 flex justify-center px-4 pointer-events-auto"
      aria-label="AI prompt form"
    >
      <div className="w-full max-w-3xl">
        <div className="flex items-center gap-3 bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 shadow-md backdrop-blur">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask me about your notes..."
            className="flex-1 min-h-11 resize-none bg-transparent outline-none text-sm text-zinc-900 dark:text-zinc-100"
            aria-label="Prompt input"
          />

          <button
            type="submit"
            disabled={isSending || !prompt.trim()}
            className="ml-2 rounded-md bg-zinc-900 text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </form>
  );
}
