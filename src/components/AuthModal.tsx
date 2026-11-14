import React from 'react';
import { useAuth } from '../context/AuthContext';
import { X, RefreshCw } from 'lucide-react';

export const AuthModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const { loginWithGoogle, isLoading, authError } = useAuth();

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    const ok = await loginWithGoogle();
    if (ok) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-[#0E131F] border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-100 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-1.5">
          <h2 className="text-lg font-bold text-zinc-100">Sign In to RoBeats News</h2>
          <p className="text-xs text-zinc-400">
            Use your Google account to sync your profile, daily streak, and Staff/Admin permissions.
          </p>
        </div>

        {authError && (
          <div className="p-3 bg-rose-950/60 border border-rose-500/30 text-rose-200 text-xs rounded-xl">
            {authError}
          </div>
        )}

        <button
          type="button"
          disabled={isLoading}
          onClick={handleGoogleSignIn}
          className="w-full py-3 px-4 bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs rounded-xl transition shadow-lg flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-zinc-700" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.91z" />
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
