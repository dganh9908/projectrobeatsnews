import React from 'react';
import { X, Megaphone } from 'lucide-react';

interface WelcomePopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWebUpdates: () => void;
}

export const WelcomePopupModal: React.FC<WelcomePopupModalProps> = ({
  isOpen,
  onClose,
  onOpenWebUpdates,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-popup-heading"
    >
      <div className="relative w-full max-w-xl rounded-2xl bg-[#0F1420] border border-cyan-500/30 shadow-2xl shadow-cyan-950/40 overflow-hidden animate-modal-pop">
        {/* Top accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 animate-gradient-flow" />

        <div className="p-5 sm:p-7 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <h2
              id="welcome-popup-heading"
              className="text-xl sm:text-2xl text-white font-display tracking-wide leading-snug bg-gradient-to-r from-cyan-300 via-sky-200 to-indigo-300 bg-clip-text text-transparent animate-gradient-flow"
            >
              WELCOME TO ROBEATS! NEWS DEMO WEBSITE
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close welcome notice"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Notice list */}
          <ul className="space-y-2.5 text-sm text-zinc-200 font-sans leading-relaxed list-disc pl-5 marker:text-cyan-400">
            <li>
              Please keep, keep, keep in mind that this website is currently WIP!
            </li>
            <li>
              All Robeats!news staffs will have a permissions for posting news
            </li>
            <li>
              If you discover any bugs, please @meelo on any Discord server where you see meelo, or send a dm to meelo (@enaalsomeelo)
            </li>
            <li>
              For any website update, please visit{' '}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenWebUpdates();
                }}
                className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2 font-semibold cursor-pointer transition-colors"
              >
                Web Updates
              </button>
            </li>
            <li>
              In this time (Demo testing), you will need a google account for sign-in, this is temporary for testing and will delete all data after this website is officially published
            </li>
          </ul>

          {/* Closing paragraph */}
          <p className="text-sm text-zinc-300 font-sans leading-relaxed pt-2 border-t border-zinc-800/80">
            And finally, please feel free to share this website with others &lt;3 here’s no limit to how many people can discover it! Also, feel free to share your feedback or any suggestions you might have
          </p>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenWebUpdates();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-cyan-300 border border-zinc-700/80 hover:border-cyan-500/40 text-xs font-semibold transition-all duration-200 active:scale-95 cursor-pointer"
            >
              <Megaphone className="w-3.5 h-3.5" />
              <span>Web Updates</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-bold shadow-md shadow-cyan-500/20 transition-all duration-200 active:scale-95 cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
