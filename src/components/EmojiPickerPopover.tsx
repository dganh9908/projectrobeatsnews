import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Plus, X } from 'lucide-react';

interface EmojiEntry {
  emoji: string;
  keywords: string;
}

interface EmojiCategory {
  id: string;
  label: string;
  icon: string;
  emojis: EmojiEntry[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    label: 'Smileys',
    icon: '😀',
    emojis: [
      { emoji: '😀', keywords: 'grinning happy smile' },
      { emoji: '😄', keywords: 'smile happy laugh' },
      { emoji: '😁', keywords: 'grin beam' },
      { emoji: '😂', keywords: 'joy laugh cry funny' },
      { emoji: '🤣', keywords: 'rofl laugh' },
      { emoji: '😊', keywords: 'blush happy' },
      { emoji: '😇', keywords: 'angel innocent' },
      { emoji: '😍', keywords: 'love heart eyes' },
      { emoji: '🤩', keywords: 'star struck excited wow' },
      { emoji: '🥳', keywords: 'party celebrate birthday' },
      { emoji: '😎', keywords: 'cool sunglasses' },
      { emoji: '🤓', keywords: 'nerd glasses' },
      { emoji: '😏', keywords: 'smirk' },
      { emoji: '🤔', keywords: 'think hmm' },
      { emoji: '😮', keywords: 'wow surprised open mouth' },
      { emoji: '😱', keywords: 'scream shocked' },
      { emoji: '🤯', keywords: 'mind blown exploding' },
      { emoji: '😳', keywords: 'flushed shocked' },
      { emoji: '🥺', keywords: 'pleading cute puppy' },
      { emoji: '😢', keywords: 'cry sad tear' },
      { emoji: '😭', keywords: 'sob cry sad' },
      { emoji: '😤', keywords: 'triumph huff determined' },
      { emoji: '😡', keywords: 'angry mad' },
      { emoji: '💀', keywords: 'skull dead' },
      { emoji: '🤡', keywords: 'clown' },
      { emoji: '👻', keywords: 'ghost' },
      { emoji: '😴', keywords: 'sleep tired' },
      { emoji: '🤤', keywords: 'drool' },
      { emoji: '🤪', keywords: 'crazy zany' },
      { emoji: '🫡', keywords: 'salute respect' },
      { emoji: '🥹', keywords: 'holding back tears touched' },
      { emoji: '🫠', keywords: 'melting' },
    ],
  },
  {
    id: 'gestures',
    label: 'Hands',
    icon: '👍',
    emojis: [
      { emoji: '👍', keywords: 'thumbs up like yes good' },
      { emoji: '👎', keywords: 'thumbs down dislike bad' },
      { emoji: '👏', keywords: 'clap applause bravo' },
      { emoji: '🙌', keywords: 'praise hands yay' },
      { emoji: '🙏', keywords: 'pray please thanks' },
      { emoji: '🤝', keywords: 'handshake deal gg' },
      { emoji: '✌️', keywords: 'peace victory gg' },
      { emoji: '🤞', keywords: 'fingers crossed luck' },
      { emoji: '👌', keywords: 'ok perfect' },
      { emoji: '🤌', keywords: 'pinched chef kiss' },
      { emoji: '🤙', keywords: 'call me shaka' },
      { emoji: '💪', keywords: 'muscle strong flex' },
      { emoji: '🫶', keywords: 'heart hands love' },
      { emoji: '👋', keywords: 'wave hi hello' },
      { emoji: '☝️', keywords: 'point up' },
      { emoji: '🫡', keywords: 'salute' },
    ],
  },
  {
    id: 'hearts',
    label: 'Hearts',
    icon: '❤️',
    emojis: [
      { emoji: '❤️', keywords: 'red heart love' },
      { emoji: '💖', keywords: 'sparkling heart love' },
      { emoji: '💗', keywords: 'growing heart love' },
      { emoji: '💓', keywords: 'beating heart' },
      { emoji: '💘', keywords: 'cupid heart' },
      { emoji: '💝', keywords: 'gift heart' },
      { emoji: '💜', keywords: 'purple heart' },
      { emoji: '💙', keywords: 'blue heart' },
      { emoji: '🩵', keywords: 'light blue cyan heart' },
      { emoji: '💚', keywords: 'green heart' },
      { emoji: '💛', keywords: 'yellow heart' },
      { emoji: '🧡', keywords: 'orange heart' },
      { emoji: '🖤', keywords: 'black heart' },
      { emoji: '🤍', keywords: 'white heart' },
      { emoji: '❤️‍🔥', keywords: 'heart on fire passion' },
      { emoji: '💔', keywords: 'broken heart' },
    ],
  },
  {
    id: 'music',
    label: 'Music & Game',
    icon: '🎵',
    emojis: [
      { emoji: '🎵', keywords: 'music note song' },
      { emoji: '🎶', keywords: 'music notes melody' },
      { emoji: '🎧', keywords: 'headphones audio' },
      { emoji: '🎤', keywords: 'microphone sing' },
      { emoji: '🎸', keywords: 'guitar rock' },
      { emoji: '🎹', keywords: 'piano keyboard synth' },
      { emoji: '🥁', keywords: 'drum beat' },
      { emoji: '🎮', keywords: 'game controller gaming' },
      { emoji: '🕹️', keywords: 'joystick arcade' },
      { emoji: '🏆', keywords: 'trophy win rank leaderboard' },
      { emoji: '🥇', keywords: 'gold first place' },
      { emoji: '🥈', keywords: 'silver second place' },
      { emoji: '🥉', keywords: 'bronze third place' },
      { emoji: '👑', keywords: 'crown king queen' },
      { emoji: '🎯', keywords: 'target bullseye accuracy' },
      { emoji: '💿', keywords: 'cd disc album' },
    ],
  },
  {
    id: 'symbols',
    label: 'Vibes & Fun',
    icon: '🔥',
    emojis: [
      { emoji: '🔥', keywords: 'fire lit hype hot' },
      { emoji: '⚡', keywords: 'lightning bolt fast' },
      { emoji: '✨', keywords: 'sparkles shine magic' },
      { emoji: '⭐', keywords: 'star' },
      { emoji: '🌟', keywords: 'glowing star' },
      { emoji: '💫', keywords: 'dizzy star' },
      { emoji: '💥', keywords: 'boom explosion' },
      { emoji: '💯', keywords: '100 hundred perfect score' },
      { emoji: '🎉', keywords: 'party popper confetti celebrate' },
      { emoji: '🎊', keywords: 'confetti ball' },
      { emoji: '🚀', keywords: 'rocket boost' },
      { emoji: '💎', keywords: 'diamond gem' },
      { emoji: '🌈', keywords: 'rainbow' },
      { emoji: '☀️', keywords: 'sun daily' },
      { emoji: '🌙', keywords: 'moon night' },
      { emoji: '❄️', keywords: 'snow ice chill' },
      { emoji: '✅', keywords: 'check done pass' },
      { emoji: '❌', keywords: 'cross fail miss' },
      { emoji: '👀', keywords: 'eyes look' },
      { emoji: '🐱', keywords: 'cat' },
      { emoji: '🐶', keywords: 'dog' },
      { emoji: '🦊', keywords: 'fox' },
      { emoji: '🐸', keywords: 'frog' },
      { emoji: '🍕', keywords: 'pizza food' },
    ],
  },
];

// Simple check to detect if user pasted/typed an emoji character directly
function extractSingleEmoji(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Reject plain ASCII letters/digits/punctuation
  if (/^[\x00-\x7F]+$/.test(trimmed)) return null;
  if (trimmed.length > 16) return null;
  return trimmed;
}

interface EmojiPickerPopoverProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

export const EmojiPickerPopover: React.FC<EmojiPickerPopoverProps> = ({
  onSelectEmoji,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<string>('smileys');
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const filteredEmojis = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return EMOJI_CATEGORIES.find(c => c.id === activeTab)?.emojis || [];
    }
    const seen = new Set<string>();
    const results: EmojiEntry[] = [];
    for (const cat of EMOJI_CATEGORIES) {
      for (const item of cat.emojis) {
        if (!seen.has(item.emoji) && (item.keywords.includes(q) || item.emoji.includes(q))) {
          seen.add(item.emoji);
          results.push(item);
        }
      }
    }
    return results;
  }, [activeTab, search]);

  const customTypedEmoji = useMemo(() => extractSingleEmoji(search), [search]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full right-0 mb-2 w-72 sm:w-80 bg-[#121722] border border-zinc-700/90 rounded-2xl shadow-2xl shadow-black/80 z-40 overflow-hidden animate-scale-in"
      onClick={e => e.stopPropagation()}
    >
      {/* Header & Search */}
      <div className="p-2.5 border-b border-zinc-800/80 bg-zinc-950/60 space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
            Emoji Reactions
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-0.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 cursor-pointer"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search or paste any emoji..."
            className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500"
            autoFocus
          />
        </div>

        {/* Category Tabs (hidden while searching) */}
        {!search.trim() && (
          <div className="flex items-center justify-between gap-1 pt-0.5">
            {EMOJI_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveTab(cat.id)}
                className={`flex-1 py-1 rounded-lg text-sm flex items-center justify-center transition-colors cursor-pointer ${
                  activeTab === cat.id
                    ? 'bg-cyan-500/20 border border-cyan-500/40'
                    : 'hover:bg-zinc-800/80 border border-transparent opacity-70 hover:opacity-100'
                }`}
                title={cat.label}
              >
                {cat.icon}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Custom typed/pasted emoji quick-add */}
      {customTypedEmoji && (
        <div className="px-2.5 pt-2">
          <button
            type="button"
            onClick={() => {
              onSelectEmoji(customTypedEmoji);
              onClose();
            }}
            className="w-full px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            <span>Add reaction</span>
            <span className="text-base leading-none">{customTypedEmoji}</span>
          </button>
        </div>
      )}

      {/* Emoji Grid */}
      <div className="p-2.5 max-h-52 overflow-y-auto">
        {filteredEmojis.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-zinc-500">
            No matching preset emoji. Paste any emoji in the search box above to add it!
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-1">
            {filteredEmojis.map(({ emoji }) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onSelectEmoji(emoji);
                  onClose();
                }}
                className="w-8 h-8 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-lg hover:scale-125 transition-transform cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
