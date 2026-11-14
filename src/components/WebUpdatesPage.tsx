import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Megaphone,
  PlusCircle,
  Loader2,
  Trash2,
  Calendar,
  Shield,
  AlertCircle,
} from 'lucide-react';
import { WebUpdateEntry } from '../types';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { safeJson } from '../utils/safeJson';
import {
  fetchWebUpdatesFromFirestore,
  subscribeToWebUpdates,
  createWebUpdateInFirestore,
  deleteWebUpdateInFirestore,
  getFirebaseIdToken,
} from '../services/firestoreService';

interface WebUpdatesPageProps {
  onBackToFeed: () => void;
}

export const WebUpdatesPage: React.FC<WebUpdatesPageProps> = ({ onBackToFeed }) => {
  const { user, token, isAuthenticated } = useAuth();
  const isAdmin = Boolean(isAuthenticated && user?.role === 'admin');

  const [updates, setUpdates] = useState<WebUpdateEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadInitial = async () => {
      setIsLoading(true);
      let fsItems: WebUpdateEntry[] = [];
      let apiItems: WebUpdateEntry[] = [];

      try {
        fsItems = await fetchWebUpdatesFromFirestore();
      } catch (err) {
        console.warn('Firestore web_updates fetch warning:', err);
      }

      try {
        const res = await fetch('/api/web-updates');
        if (res.ok) {
          const data = await safeJson<WebUpdateEntry[] | null>(res, null);
          if (Array.isArray(data)) {
            apiItems = data;
          }
        }
      } catch (err) {
        console.warn('API /api/web-updates fetch warning:', err);
      }

      if (!mounted) return;
      const merged = new Map<string, WebUpdateEntry>();
      for (const item of apiItems) merged.set(item.id, item);
      for (const item of fsItems) merged.set(item.id, item);
      const list = Array.from(merged.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setUpdates(list);
      setIsLoading(false);
    };

    loadInitial();

    const unsubscribe = subscribeToWebUpdates(
      (fsItems) => {
        if (!mounted) return;
        setUpdates((prev) => {
          const map = new Map<string, WebUpdateEntry>();
          for (const item of prev) {
            if (!item.id.startsWith('webupdate_')) map.set(item.id, item);
          }
          for (const item of fsItems) map.set(item.id, item);
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
        setIsLoading(false);
      },
      (err) => {
        console.warn('Firestore web_updates subscription warning:', err.message);
      }
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    if (!cleanTitle || !cleanDescription) {
      setErrorMsg('Please enter both a Title and a Description.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      let created: WebUpdateEntry | null = null;

      if (auth.currentUser) {
        created = await createWebUpdateInFirestore(
          cleanTitle,
          cleanDescription,
          user?.displayName || user?.username || 'Admin'
        );
      } else {
        const fbToken = await getFirebaseIdToken();
        const res = await fetch('/api/web-updates', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(fbToken ? { 'X-Firebase-Token': fbToken } : {}),
          },
          body: JSON.stringify({
            title: cleanTitle,
            description: cleanDescription,
          }),
        });
        const data = await safeJson<any>(res, null);
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to publish web update');
        }
        created = data as WebUpdateEntry;
      }

      if (created) {
        setUpdates((prev) => [created!, ...prev.filter((u) => u.id !== created!.id)]);
      }
      setTitle('');
      setDescription('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to publish web update.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    setDeletingId(id);
    setErrorMsg('');
    try {
      if (auth.currentUser) {
        await deleteWebUpdateInFirestore(id);
      } else {
        const fbToken = await getFirebaseIdToken();
        const res = await fetch(`/api/web-updates/${id}`, {
          method: 'DELETE',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(fbToken ? { 'X-Firebase-Token': fbToken } : {}),
          },
        });
        if (!res.ok) {
          const data = await safeJson<any>(res, null);
          throw new Error(data?.error || 'Failed to delete web update');
        }
      }
      setUpdates((prev) => prev.filter((u) => u.id !== id));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete web update.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10">
      {/* Return action */}
      <div className="mb-6">
        <button
          type="button"
          onClick={onBackToFeed}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 hover:border-zinc-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
          <span>Back to News Feed</span>
        </button>
      </div>

      {/* Page Header */}
      <header className="pb-6 mb-6 border-b border-zinc-800/80 space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <Megaphone className="w-4 h-4 text-cyan-400" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-normal text-white tracking-tight font-display">
            Web Updates
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-zinc-400 font-sans">
          Website owner announcements, maintenance notices, and platform changelogs. All published updates are archived here.
        </p>
      </header>

      {/* Admin-Only Composer (Title + Description ONLY) */}
      {isAdmin && (
        <section className="mb-8 p-5 sm:p-6 rounded-2xl bg-[#111622] border border-cyan-500/30 shadow-lg shadow-cyan-500/5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              <h2 className="text-base sm:text-lg text-white font-display">
                Post Web Update
              </h2>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              @Admin Only
            </span>
          </div>

          <form onSubmit={handlePublish} className="space-y-4">
            {errorMsg && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="webupdate-title"
                className="block text-xs font-medium text-zinc-300 font-sans"
              >
                Title
              </label>
              <input
                id="webupdate-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Enter update title..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0E14] border border-zinc-800 focus:border-cyan-500/60 focus:outline-none text-white text-base sm:text-lg font-display placeholder:text-zinc-600 transition-colors"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="webupdate-description"
                className="block text-xs font-medium text-zinc-300 font-sans"
              >
                Description
              </label>
              <textarea
                id="webupdate-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={10000}
                rows={4}
                placeholder="Write website update details..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0E14] border border-zinc-800 focus:border-cyan-500/60 focus:outline-none text-zinc-200 text-sm font-sans font-normal placeholder:text-zinc-600 resize-y transition-colors"
                required
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-zinc-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PlusCircle className="w-4 h-4" />
                )}
                <span>{isSubmitting ? 'Publishing...' : 'Publish Web Update'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Archive List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px]">
            Update Archive ({updates.length})
          </span>
        </div>

        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center text-zinc-400 space-y-3">
            <Loader2 className="w-7 h-7 animate-spin text-cyan-400" />
            <p className="text-xs">Loading web updates...</p>
          </div>
        ) : updates.length === 0 ? (
          <div className="py-14 px-4 bg-[#111622]/70 border border-zinc-800/80 rounded-2xl text-center space-y-2">
            <Megaphone className="w-7 h-7 text-zinc-600 mx-auto" />
            <h3 className="text-base text-white font-display">No web updates yet</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto font-sans">
              Website owner announcements and update logs will appear here once posted by @Admin.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {updates.map((entry) => (
              <article
                key={entry.id}
                className="p-5 sm:p-6 rounded-2xl bg-[#111622] border border-zinc-800/90 hover:border-zinc-700/90 transition-colors space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400 font-sans">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                        @Admin
                      </span>
                      <span className="text-zinc-300 font-medium">{entry.authorName}</span>
                      <span className="text-zinc-600">·</span>
                      <span className="inline-flex items-center gap-1 text-zinc-400">
                        <Calendar className="w-3 h-3 text-cyan-400/80" />
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl text-white font-display tracking-tight break-words">
                      {entry.title}
                    </h2>
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-colors cursor-pointer shrink-0"
                      title="Delete web update (Admin only)"
                    >
                      {deletingId === entry.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>

                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words font-sans font-normal">
                  {entry.description}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};
