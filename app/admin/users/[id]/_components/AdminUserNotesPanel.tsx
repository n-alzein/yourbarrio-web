"use client";

import { useMemo, useState } from "react";

type AdminUserNote = {
  id: string;
  target_user_id: string;
  actor_user_id: string;
  note: string;
  created_at: string;
  updated_at?: string;
};

type AdminUserNotesPanelProps = {
  userId: string;
  canWriteNotes: boolean;
  canDeleteAnyNote: boolean;
  currentAdminUserId: string | null;
  initialNotes: AdminUserNote[];
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
}

export default function AdminUserNotesPanel({
  userId,
  canWriteNotes,
  canDeleteAnyNote,
  currentAdminUserId,
  initialNotes,
}: AdminUserNotesPanelProps) {
  const [notes, setNotes] = useState<AdminUserNote[]>(initialNotes);
  const [noteText, setNoteText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null);

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [notes]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWriteNotes || isSubmitting) return;

    const trimmed = noteText.trim();
    if (trimmed.length < 3 || trimmed.length > 2000) {
      setErrorMessage("Note must be between 3 and 2000 characters.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticNote: AdminUserNote = {
      id: tempId,
      target_user_id: userId,
      actor_user_id: "",
      note: trimmed,
      created_at: new Date().toISOString(),
    };

    setNotes((current) => [optimisticNote, ...current]);

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/notes`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ note: trimmed }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.note) {
        throw new Error(payload?.error || "Failed to add note");
      }

      const inserted = payload.note as AdminUserNote;
      setNotes((current) => [inserted, ...current.filter((item) => item.id !== tempId)]);
      setNoteText("");
    } catch (error: any) {
      setNotes((current) => current.filter((item) => item.id !== tempId));
      setErrorMessage(error?.message || "Failed to add note");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(note: AdminUserNote) {
    setEditingNoteId(note.id);
    setEditingText(note.note);
    setErrorMessage(null);
  }

  function cancelEdit() {
    setEditingNoteId(null);
    setEditingText("");
  }

  async function handleSaveEdit(noteId: string) {
    if (!canWriteNotes || busyNoteId) return;
    const trimmed = editingText.trim();
    if (trimmed.length < 3 || trimmed.length > 2000) {
      setErrorMessage("Note must be between 3 and 2000 characters.");
      return;
    }

    setErrorMessage(null);
    setBusyNoteId(noteId);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/notes`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ noteId, note: trimmed }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.note) {
        throw new Error(payload?.error || "Failed to update note");
      }
      const updated = payload.note as AdminUserNote;
      setNotes((current) => current.map((item) => (item.id === noteId ? updated : item)));
      setEditingNoteId(null);
      setEditingText("");
    } catch (error: any) {
      setErrorMessage(error?.message || "Failed to update note");
    } finally {
      setBusyNoteId(null);
    }
  }

  async function handleDelete(note: AdminUserNote) {
    if (!canWriteNotes || busyNoteId) return;
    const confirmed = window.confirm("Delete this note?");
    if (!confirmed) return;

    setErrorMessage(null);
    setBusyNoteId(note.id);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/notes`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ noteId: note.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.deletedNote) {
        throw new Error(payload?.error || "Failed to delete note");
      }
      setNotes((current) => current.filter((item) => item.id !== note.id));
      if (editingNoteId === note.id) {
        setEditingNoteId(null);
        setEditingText("");
      }
    } catch (error: any) {
      setErrorMessage(error?.message || "Failed to delete note");
    } finally {
      setBusyNoteId(null);
    }
  }

  return (
    <div className="space-y-3">
      {canWriteNotes ? (
        <form onSubmit={handleSubmit} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <h3 className="mb-2 font-medium">Add internal note</h3>
          <textarea
            name="note"
            required
            rows={4}
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            placeholder="Internal note"
            maxLength={2000}
            disabled={isSubmitting}
          />
          {errorMessage ? <p className="mt-2 text-sm text-rose-300">{errorMessage}</p> : null}
          <button
            type="submit"
            className="mt-2 rounded bg-sky-600 px-3 py-2 text-sm hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save note"}
          </button>
        </form>
      ) : (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
          You do not have permission to add notes.
        </div>
      )}

      <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="mb-2 font-medium">Notes</h3>
        {sortedNotes.length === 0 ? (
          <p className="text-sm text-neutral-400">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {sortedNotes.map((note) => (
              <li key={note.id} className="rounded border border-neutral-800 bg-neutral-950 p-3">
                {editingNoteId === note.id ? (
                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      value={editingText}
                      onChange={(event) => setEditingText(event.target.value)}
                      maxLength={2000}
                      className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                      disabled={busyNoteId === note.id}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(note.id)}
                        className="rounded bg-sky-600 px-2 py-1 text-xs hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={busyNoteId === note.id}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={busyNoteId === note.id}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-sm">{note.note}</p>
                )}
                <p className="mt-2 text-xs text-neutral-500">{formatDateTime(note.created_at)}</p>
                {canWriteNotes ? (
                  <div className="mt-2 flex items-center gap-2">
                    {note.actor_user_id === currentAdminUserId ? (
                      <button
                        type="button"
                        onClick={() => startEdit(note)}
                        className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={Boolean(busyNoteId)}
                      >
                        Edit
                      </button>
                    ) : null}
                    {note.actor_user_id === currentAdminUserId || canDeleteAnyNote ? (
                      <button
                        type="button"
                        onClick={() => handleDelete(note)}
                        className="rounded border border-rose-900/70 px-2 py-1 text-xs text-rose-200 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={Boolean(busyNoteId)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
