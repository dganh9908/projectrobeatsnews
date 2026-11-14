import React, { useState, useEffect } from 'react';
import {
  X,
  Flame,
  Trophy,
  Sparkles,
  Check,
  Calendar,
  Lock,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { safeJson } from '../utils/safeJson';
import { auth } from '../lib/firebase';
import { checkInStreakInFirestore } from '../services/firestoreService';

interface StreakModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAccount?: (tab?: 'login' | 'profile') => void;
}

const STREAK_MILESTONES = [
  { id: 'day_1', label: 'Day 1', title: 'First Check-In', requiredDays: 1 },
  { id: 'day_3', label: 'Day 3', title: 'Rhythm Spark', requiredDays: 3 },
  { id: 'day_7', label: 'Day 7', title: 'Weekly Maestro', requiredDays: 7 },
  { id: 'day_14', label: 'Day 14', title: 'Two-Week Pro', requiredDays: 14 },
  { id: 'day_30', label: 'Day 30', title: 'Monthly Legend', requiredDays: 30 },
];

export const StreakModal: React.FC<StreakModalProps> = ({
  isOpen,
  onClose,
  onOpenAccount,
}) => {
  const { user, token, isAuthenticated, updateProfile } = useAuth();

  const [currentStreak, setCurrentStreak] = useState<number>(() => user?.currentStreak || 0);
  const [bestStreak, setBestStreak] = useState<number>(() => user?.bestStreak || 0);
  const [lastCheckInDate, setLastCheckInDate] = useState<string>(() => user?.lastCheckInDate || '');
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState<string | null>(null);

  const getGmt8Today = () => {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const gmt8Date = new Date(utc - 8 * 3600000);
    const y = gmt8Date.getFullYear();
    const m = String(gmt8Date.getMonth() + 1).padStart(2, '0');
    const d = String(gmt8Date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const todayStr = getGmt8Today();
  const hasCheckedInToday = Boolean(isAuthenticated && lastCheckInDate === todayStr);

  useEffect(() => {
    if (user && isAuthenticated) {
      setCurrentStreak(user.currentStreak ?? 0);
      setBestStreak(user.bestStreak ?? 0);
      setLastCheckInDate(user.lastCheckInDate || '');
    } else {
      setCurrentStreak(0);
      setBestStreak(0);
      setLastCheckInDate('');
    }
  }, [user, isAuthenticated]);

  if (!isOpen) return null;

  const handleCheckIn = async () => {
    if (!isAuthenticated || !user || hasCheckedInToday || isCheckingIn) return;
    setIsCheckingIn(true);
    setCheckInMessage(null);

    try {
      if (auth.currentUser) {
        const data = await checkInStreakInFirestore();
        if (data.success) {
          setCurrentStreak(data.currentStreak);
          setBestStreak(data.bestStreak);
          setLastCheckInDate(data.lastCheckInDate);
          setCheckInMessage(`🔥 Day ${data.currentStreak} streak claimed!`);

          await updateProfile({
            currentStreak: data.currentStreak,
            bestStreak: data.bestStreak,
            lastCheckInDate: data.lastCheckInDate,
          });
        } else if (data.alreadyCheckedIn) {
          setLastCheckInDate(data.lastCheckInDate);
          setCheckInMessage(data.message || 'Already checked in today!');
        }
      } else if (token) {
        const res = await fetch('/api/streak/check-in', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await safeJson(res, null);
        if (data && data.success) {
          setCurrentStreak(data.currentStreak);
          setBestStreak(data.bestStreak);
          setLastCheckInDate(data.lastCheckInDate);
          setCheckInMessage(`🔥 Day ${data.currentStreak} streak claimed!`);

          await updateProfile({
            currentStreak: data.currentStreak,
            bestStreak: data.bestStreak,
            lastCheckInDate: data.lastCheckInDate,
          });
        } else if (data && data.alreadyCheckedIn) {
          setCheckInMessage(data.message || 'Already checked in today!');
        }
      }
    } catch (err: any) {
      setCheckInMessage(err.message || 'Check-in failed');
    } finally {
      setIsCheckingIn(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-[#0D111A] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-post-entrance"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-gradient-to-r from-orange-950/40 via-[#111622] to-zinc-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 shadow-md shadow-orange-500/10">
              <Flame className="w-5 h-5 text-orange-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white font-display">Daily Streak</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/40 uppercase">
                  Login Streak
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Check in daily to build and maintain your login streak!
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/60 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {!isAuthenticated || !user ? (
            <div className="p-6 rounded-2xl bg-zinc-900/70 border border-zinc-800 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 max-w-sm mx-auto">
                <h4 className="text-sm sm:text-base font-bold text-white">
                  Sign In Required for Login Streak
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Login Streak is only available for signed-in accounts. Sign in with Google to claim daily check-ins and track your streak record.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAccount?.('login');
                }}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs cursor-pointer transition-colors"
              >
                Sign In with Google
              </button>
            </div>
          ) : (
            <>
              {/* Main Streak Hero Card */}
              <div className="relative rounded-2xl bg-gradient-to-br from-orange-950/60 via-zinc-900 to-[#121824] border border-orange-500/30 p-5 sm:p-6 shadow-xl overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                  <Flame className="w-44 h-44 text-orange-400" />
                </div>

                <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-5 text-center sm:text-left">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-orange-300 flex items-center justify-center sm:justify-start gap-1.5">
                      <Flame className="w-4 h-4 text-orange-400" />
                      <span>Current Streak Record</span>
                    </span>
                    <div className="flex items-baseline justify-center sm:justify-start gap-2">
                      <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                        {currentStreak}
                      </span>
                      <span className="text-lg font-bold text-orange-400">
                        {currentStreak === 1 ? 'Day' : 'Days'}
                      </span>
                    </div>
                    <div className="flex items-center justify-center sm:justify-start gap-3 text-xs text-zinc-400 pt-1">
                      <span className="flex items-center gap-1 font-mono">
                        <Trophy className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          Best: <strong>{bestStreak}</strong> days
                        </span>
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1 font-mono text-zinc-500">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Reset: GMT-8 Midnight</span>
                      </span>
                    </div>
                  </div>

                  {/* Manual Check-In Button */}
                  <div className="shrink-0 flex flex-col items-center">
                    {hasCheckedInToday ? (
                      <div className="px-5 py-3 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 flex items-center gap-2.5 font-bold text-xs shadow-md shadow-emerald-950">
                        <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                        <span>Checked in today!</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCheckIn}
                        disabled={isCheckingIn}
                        className="group relative px-6 py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-400 hover:to-yellow-400 text-zinc-950 font-black text-sm flex items-center gap-2.5 shadow-xl shadow-orange-500/25 hover:shadow-orange-500/40 transition-all cursor-pointer transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                      >
                        {isCheckingIn ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-zinc-950" />
                        ) : (
                          <Flame className="w-4 h-4 text-zinc-950 fill-zinc-950 group-hover:animate-bounce" />
                        )}
                        <span>Claim Day {currentStreak + 1} Streak</span>
                      </button>
                    )}
                    <span className="text-[10px] text-zinc-400 mt-1.5 font-medium">
                      {hasCheckedInToday ? 'Come back tomorrow for next day!' : 'Click to register daily check-in'}
                    </span>
                  </div>
                </div>

                {/* Check-in Message Feedback */}
                {checkInMessage && (
                  <div className="mt-4 p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-200 text-xs font-medium flex items-center gap-2 animate-fadeIn">
                    <Sparkles className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                    <span>{checkInMessage}</span>
                  </div>
                )}
              </div>

              {/* Streak Milestone Track */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Streak Milestones</span>
                  </h4>
                  <span className="text-[11px] text-zinc-500">
                    {STREAK_MILESTONES.filter((m) => bestStreak >= m.requiredDays || currentStreak >= m.requiredDays).length} of {STREAK_MILESTONES.length} Reached
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {STREAK_MILESTONES.map((milestone) => {
                    const isReached = currentStreak >= milestone.requiredDays || bestStreak >= milestone.requiredDays;

                    return (
                      <div
                        key={milestone.id}
                        className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-between gap-2 transition-all ${
                          isReached
                            ? 'bg-orange-950/30 border-orange-500/50 shadow-sm shadow-orange-500/10'
                            : 'bg-zinc-950/60 border-zinc-900 opacity-65'
                        }`}
                      >
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            isReached
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          {milestone.label}
                        </span>

                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center border ${
                            isReached
                              ? 'bg-orange-500/20 border-orange-400/50 text-orange-300'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-600'
                          }`}
                        >
                          {isReached ? <Check className="w-4 h-4 stroke-[3]" /> : <Lock className="w-3.5 h-3.5" />}
                        </div>

                        <div className="space-y-0.5">
                          <div className="text-[11px] font-bold text-white truncate max-w-[95px]">
                            {milestone.title}
                          </div>
                          <div className="text-[9px] text-zinc-400 font-mono">
                            {isReached ? 'Completed' : `${milestone.requiredDays}d streak`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-[#111622] flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 font-mono">
            RoBeats! Login Streak · Claim Every 24h
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
