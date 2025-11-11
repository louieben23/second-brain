"use client";

import React, { useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function NoteSidebar({ open, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  

  const handleSave = () => {
    // POST the note to the embeddings save endpoint so it will be converted and persisted
    void (async () => {
      try {
        setSaving(true);
        setSaveStatus(null);
        const payload = {
          chunks: [
            {
              content,
              metadata: { title, source: 'note-sidebar' },
            },
          ],
        };

        const res = await fetch('/api/embeddings/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const j = await res.json();
        if (res.ok) {
          console.log('Note saved (embedding pipeline):', j);
          setSaveStatus('saved');
          // clear inputs after successful save
          setTitle('');
          setContent('');
          // no-op: history is shown in the sidebar/nav
          // close the sidebar after a short delay so user sees the saved state
          setTimeout(() => onClose(), 350);
        } else {
          console.error('Failed to save note:', j);
          setSaveStatus('error');
        }
      } catch (e) {
        console.error('Error saving note:', e);
        setSaveStatus('error');
      } finally {
        setSaving(false);
        setTimeout(() => setSaveStatus(null), 3000);
      }
    })();
  };

  

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 bg-black/40 transition-opacity duration-200 z-40 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Sidebar panel */}
      <aside
        aria-hidden={!open}
        className={`fixed top-0 right-0 h-full w-96 bg-white dark:bg-neutral-900 shadow-xl z-50 transform transition-transform duration-200 flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-4 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Take a Note</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Update your knowledgebase by taking a note</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close note sidebar"
            className="text-gray-500 hover:text-gray-700 dark:text-gray-300 ml-4"
          >
            ✕
          </button>
        </div>

        <div className="p-4 flex-1 overflow-auto">
          <label className="block text-sm text-gray-700 dark:text-gray-200 mb-2">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full mb-4 px-3 py-2 border rounded bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-sm"
            placeholder="Short title"
          />

          <label className="block text-sm text-gray-700 dark:text-gray-200 mb-2">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-48 px-3 py-2 border rounded bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-sm resize-none"
            placeholder="Write your note here..."
          />
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-neutral-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-100 dark:bg-neutral-800 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-4 py-2 rounded text-white text-sm ${saving ? 'bg-blue-400' : 'bg-blue-600'}`}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saveStatus === 'saved' && <div className="ml-3 self-center text-sm text-green-600">Saved ✅</div>}
          {saveStatus === 'error' && <div className="ml-3 self-center text-sm text-red-600">Save failed</div>}
        </div>
      </aside>
    </>
  );
}
