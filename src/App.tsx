import React, { useState, useEffect, useMemo } from 'react';
import { NewsCategory, NewsArticle, SongEntry } from './types';
import { Header } from './components/Header';
import { AccountModal } from './components/AccountModal';
import { AdminPanel } from './components/AdminPanel';
import { SongList } from './components/SongList';
import { PostCard } from './components/PostCard';
import { CreatePostModal } from './components/CreatePostModal';
import { EditPostModal } from './components/EditPostModal';
import { SongDetailsModal } from './components/SongDetailsModal';
import { UserProfileModal } from './components/UserProfileModal';
import { StreakModal } from './components/StreakModal';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { useAuth } from './context/AuthContext';
import { 
  PlusCircle, 
  Sparkles, 
  Music, 
  Loader2, 
  Calendar,
  Layers,
  Shield,
  Crown
} from 'lucide-react';
import { CountdownBadge } from './components/CountdownTimer';
import { safeJson } from './utils/safeJson';
import { auth } from './lib/firebase';
import {
  subscribeToPublishedPosts,
  fetchPostsFromFirestore,
  deletePostInFirestore,
  getFirebaseIdToken,
} from './services/firestoreService';
import { fetchSongsList } from './services/api';
import {
  SONGS_UPDATED_EVENT,
  SongsUpdatedEventDetail,
  applyCatalogUpdatesToSongs,
} from './utils/songSync';

export default function App() {
  const { user, token, isAuthenticated } = useAuth();

  // Navigation & Category State
  const [currentCategory, setCurrentCategory] = useState<NewsCategory>('All');
  const [currentPath, setCurrentPath] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const isPrivacyPage = currentPath === '/privacy' || currentPath === '/privacy/';

  // Posts State
  const [posts, setPosts] = useState<NewsArticle[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);

  // Live Songs Catalog State (used to reflect song edits & Sheet updates immediately in News)
  const [songsCatalog, setSongsCatalog] = useState<SongEntry[]>([]);

  // Account Modal State
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountModalTab, setAccountModalTab] = useState<'login' | 'profile'>('login');

  // Streak Modal State
  const [isStreakModalOpen, setIsStreakModalOpen] = useState(false);

  // Admin Panel State
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);

  // Create Post Modal State (Only Staff & Admin)
  const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false);

  // Edit Post Modal State (Staff & Admin)
  const [editingPost, setEditingPost] = useState<NewsArticle | null>(null);

  // Song Details Modal State
  const [selectedSongDetail, setSelectedSongDetail] = useState<SongEntry | null>(null);

  // User Profile Modal State
  const [viewingUserProfile, setViewingUserProfile] = useState<any>(null);

  // Check if current user is Staff or Admin
  const canUserPost = isAuthenticated && user && (
    user.role === 'staff' || 
    user.role === 'admin' || 
    user.permissions?.canPublishNews
  );

  // Fetch posts from Firebase Firestore + /api/news with resilient fallback
  const fetchPosts = async () => {
    try {
      setIsLoadingPosts(true);
      let firestorePosts: NewsArticle[] = [];
      let apiPosts: NewsArticle[] = [];

      try {
        firestorePosts = await fetchPostsFromFirestore();
      } catch (fsErr) {
        console.warn('Firestore fetch warning, checking API fallback:', fsErr);
      }

      try {
        const res = await fetch('/api/news');
        if (res.ok) {
          const data = await safeJson<NewsArticle[] | null>(res, null);
          if (Array.isArray(data) && data.length > 0) {
            apiPosts = data;
          }
        }
      } catch (err) {
        console.warn('News API fetch error:', err);
      }

      const mergedMap = new Map<string, NewsArticle>();
      for (const p of apiPosts) {
        if (p.id !== 'post-daily-missions-initial') mergedMap.set(p.id, p);
      }
      for (const p of firestorePosts) mergedMap.set(p.id, p);

      const loadedPosts = Array.from(mergedMap.values());
      loadedPosts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      setPosts(loadedPosts);
    } catch (err) {
      console.error('Failed to fetch posts', err);
      setPosts([]);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  useEffect(() => {
    fetchPosts();

    // Real-time listener to Firebase Cloud Firestore posts
    const unsubscribe = subscribeToPublishedPosts(
      (fsPosts) => {
        const sorted = [...fsPosts].sort(
          (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        );
        setPosts(sorted);
        setIsLoadingPosts(false);
      },
      (err) => {
        console.warn('Firestore realtime subscription warning:', err.message);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadCatalog = (forceRefreshSheet: boolean = false) => {
      fetchSongsList(forceRefreshSheet)
        .then((list) => {
          if (mounted && Array.isArray(list) && list.length > 0) {
            setSongsCatalog(list);
          }
        })
        .catch(() => {});
    };

    loadCatalog(false);

    const handleSongsUpdated = (evt: Event) => {
      const customEvt = evt as CustomEvent<SongsUpdatedEventDetail>;
      const detail = customEvt.detail || {};

      if (detail.deletedSongId) {
        setSongsCatalog((prev) => prev.filter((s) => s.id !== detail.deletedSongId));
      }

      if (Array.isArray(detail.updatedSongs) && detail.updatedSongs.length > 0) {
        setSongsCatalog((prev) => {
          const map = new Map<string, SongEntry>();
          for (const item of prev) map.set(item.id, item);
          for (const upd of detail.updatedSongs!) {
            if (upd?.id) map.set(upd.id, { ...(map.get(upd.id) || {}), ...upd });
          }
          return Array.from(map.values());
        });
      }

      if (detail.forceRefresh) {
        loadCatalog(true);
      }
    };

    window.addEventListener(SONGS_UPDATED_EVENT, handleSongsUpdated);
    return () => {
      mounted = false;
      window.removeEventListener(SONGS_UPDATED_EVENT, handleSongsUpdated);
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    document.title = isPrivacyPage
      ? 'Privacy Policy - RoBeats! News'
      : 'RoBeats! News';
  }, [isPrivacyPage]);

  const navigateTo = (targetPath: '/' | '/privacy') => {
    if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setCurrentPath(targetPath);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSelectCategory = (cat: NewsCategory) => {
    setCurrentCategory(cat);
    if (isPrivacyPage) {
      navigateTo('/');
    }
  };

  const handleOpenAccount = (tab: 'login' | 'profile' = 'login') => {
    setAccountModalTab(tab);
    setIsAccountModalOpen(true);
  };

  const handlePostCreated = (newPost: NewsArticle) => {
    setPosts(prev => [newPost, ...prev.filter(p => p.id !== newPost.id)]);
    if (currentCategory !== 'All' && currentCategory !== 'Song List' && newPost.category !== currentCategory) {
      setCurrentCategory(newPost.category);
    }
  };

  const handlePostUpdated = (updatedPost: NewsArticle) => {
    setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
  };

  const handleDeletePost = async (id: string) => {
    try {
      if (auth.currentUser) {
        await deletePostInFirestore(id);
      } else {
        const fbToken = await getFirebaseIdToken();
        const res = await fetch(`/api/news/${id}`, {
          method: 'DELETE',
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...(fbToken ? { 'X-Firebase-Token': fbToken } : {}),
          },
        });
        if (!res.ok) {
          throw new Error('Failed to delete post');
        }
      }

      setPosts(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      console.error('Failed to delete post', err);
      alert(err?.message || 'Failed to delete post');
    }
  };

  const handleSongClick = (song: SongEntry) => {
    setSelectedSongDetail(song);
  };

  const enrichedPosts = useMemo(() => {
    return posts.map((post) => {
      if (!Array.isArray(post.songs) || post.songs.length === 0) return post;
      const syncedSongs = applyCatalogUpdatesToSongs(post.songs, songsCatalog);
      return syncedSongs === post.songs ? post : { ...post, songs: syncedSongs };
    });
  }, [posts, songsCatalog]);

  // Filter posts by category and search
  const filteredPosts = useMemo(() => {
    return enrichedPosts.filter(post => {
      // Category filter
      if (currentCategory !== 'All') {
        if (post.category.toLowerCase() !== currentCategory.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [enrichedPosts, currentCategory]);

  return (
    <div className="min-h-screen bg-[#0B0E14] text-zinc-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 
        Top Header:
        Date, RoBeats News, category filters, Account trigger, Admin trigger,
        and the Post button accessible ONLY to Staff and Admin accounts.
      */}
      <Header
        currentCategory={currentCategory}
        onSelectCategory={handleSelectCategory}
        onOpenAccount={handleOpenAccount}
        onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
        onOpenCreatePost={() => setIsCreatePostModalOpen(true)}
        onOpenStreak={() => setIsStreakModalOpen(true)}
        isPrivacyPage={isPrivacyPage}
        onOpenPrivacy={() => navigateTo('/privacy')}
      />

      {/* Main Content Area */}
      {isPrivacyPage ? (
        <PrivacyPolicy onBackToFeed={() => navigateTo('/')} />
      ) : currentCategory === 'Song List' ? (
        <main className="flex-1">
          {user?.role === 'admin' ? (
            <SongList onOpenAccount={handleOpenAccount} />
          ) : (
            <div className="max-w-md mx-auto my-16 p-8 bg-[#111622] border border-amber-500/30 rounded-2xl text-center">
              <h2 className="text-lg font-bold text-white mb-2">Administrator Access Required</h2>
              <p className="text-xs text-zinc-400 mb-5">
                The RoBeats Song List database and editing tools are strictly restricted to Admin accounts.
              </p>
              <button
                onClick={() => setCurrentCategory('All')}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold cursor-pointer"
              >
                Return to News Feed
              </button>
            </div>
          )}
        </main>
      ) : (
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6">
          {/* Feed Title & Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-zinc-800/80">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {currentCategory === 'All' ? 'News Feed' : currentCategory}
                </h1>
                {currentCategory === 'Daily mission' && (
                  <CountdownBadge type="daily" />
                )}
                {currentCategory === 'Weekly mission' && (
                  <CountdownBadge type="weekly" />
                )}
                {currentCategory === 'Weekly Leaderboard' && (
                  <CountdownBadge type="leaderboard" />
                )}
              </div>
            </div>

            {/* Post button for Staff and Admin only */}
            {canUserPost && (
              <button
                onClick={() => setIsCreatePostModalOpen(true)}
                className="self-start sm:self-auto flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow-md shadow-emerald-500/20 cursor-pointer shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Create New Post</span>
              </button>
            )}
          </div>

          {/* Posts List */}
          {isLoadingPosts ? (
            <div className="py-20 flex flex-col items-center justify-center text-zinc-400 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              <p className="text-xs">Loading posts...</p>
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="py-16 px-4 bg-[#111622]/60 border border-zinc-800/80 rounded-2xl text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
                <Music className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">No posts found</h3>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  No posts available in {currentCategory === 'All' ? 'the feed' : currentCategory} yet.
                </p>
              </div>

              {canUserPost && (
                <button
                  onClick={() => setIsCreatePostModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Create the first post</span>
                </button>
              )}
            </div>
          ) : (
            <div key={currentCategory} className="space-y-4 animate-post-entrance">
              {filteredPosts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  activeCategory={currentCategory}
                  onDelete={handleDeletePost}
                  onEdit={(p) => setEditingPost(p)}
                  onSongClick={handleSongClick}
                  onOpenAccount={handleOpenAccount}
                  onUserClick={(author) => setViewingUserProfile(author)}
                />
              ))}
            </div>
          )}
        </main>
      )}

      {/* Post Creator Modal - ONLY for Staff & Admin */}
      <CreatePostModal
        isOpen={isCreatePostModalOpen}
        onClose={() => setIsCreatePostModalOpen(false)}
        onPostCreated={handlePostCreated}
      />

      {/* Account System Modal */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        initialTab={accountModalTab}
        onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
      />

      {/* Admin Panel Modal - Strictly for Admin role */}
      {isAdminPanelOpen && user?.role === 'admin' && (
        <AdminPanel
          isOpen={isAdminPanelOpen}
          onClose={() => setIsAdminPanelOpen(false)}
          onOpenAccount={handleOpenAccount}
        />
      )}

      {/* Edit Post Modal - Staff & Admin */}
      <EditPostModal
        post={editingPost}
        isOpen={Boolean(editingPost)}
        onClose={() => setEditingPost(null)}
        onPostUpdated={handlePostUpdated}
      />

      {/* Song Details Modal */}
      {selectedSongDetail && (
        <SongDetailsModal
          song={selectedSongDetail}
          onClose={() => setSelectedSongDetail(null)}
          onSongUpdated={(updated) => {
            setSelectedSongDetail((prev) =>
              prev
                ? {
                    ...updated,
                    uniqueKey: prev.uniqueKey,
                    chosenDifficulty: prev.chosenDifficulty,
                    missionRank: prev.missionRank,
                    noMisses: prev.noMisses,
                    isNoMisses: prev.isNoMisses,
                    requiredScore: prev.requiredScore,
                  }
                : updated
            );
            setSongsCatalog((prev) => {
              const idx = prev.findIndex((s) => s.id === updated.id);
              if (idx === -1) return [updated, ...prev];
              return prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s));
            });
          }}
        />
      )}

      {/* User Public Profile Modal */}
      {viewingUserProfile && (
        <UserProfileModal
          user={viewingUserProfile}
          isOpen={Boolean(viewingUserProfile)}
          onClose={() => setViewingUserProfile(null)}
          onEditOwnProfile={() => {
            setViewingUserProfile(null);
            handleOpenAccount('profile');
          }}
        />
      )}

      {/* Login Streak Modal */}
      <StreakModal
        isOpen={isStreakModalOpen}
        onClose={() => setIsStreakModalOpen(false)}
        onOpenAccount={handleOpenAccount}
      />

      {/* Modern Minimal Dark Footer */}
      <footer className="border-t border-zinc-900 bg-[#0B0E14] py-8 text-zinc-500 text-xs mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="font-semibold text-zinc-300">
            RoBeats! News
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/privacy"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/privacy');
              }}
              className="text-zinc-400 hover:text-cyan-300 transition-colors underline-offset-4 hover:underline"
            >
              Privacy Policy
            </a>
            <span aria-hidden="true" className="text-zinc-700">·</span>
            <span>© 2026 RoBeats! News</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
