import { Smile } from 'lucide-react';
import { useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { t } from '@/i18n/zh-CN';
import { cn } from '@/lib/utils';

/** 一份精简的常用表情，按类别分组；用原生 emoji，不引入图片资源 */
const CATEGORIES: { key: string; icon: string; emojis: string }[] = [
  {
    key: 'smileys',
    icon: '😀',
    emojis:
      '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😚 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖',
  },
  {
    key: 'gestures',
    icon: '👍',
    emojis:
      '👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👋 🤚 🖐️ ✋ 🖖 👏 🙌 🤝 🙏 ✍️ 💪 🫶 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💖 💗 💯 💢 💥 💫 💦 💤',
  },
  {
    key: 'nature',
    icon: '🐶',
    emojis:
      '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦉 🐺 🐴 🦄 🐝 🐛 🦋 🐌 🐢 🐍 🐙 🦀 🐟 🐬 🐳 🌸 🌹 🌻 🌲 🍀 🌈 ☀️ 🌙 ⭐ 🔥 ❄️ 💧',
  },
  {
    key: 'food',
    icon: '🍎',
    emojis:
      '🍎 🍊 🍋 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥝 🍅 🥑 🌽 🍞 🧀 🍔 🍟 🍕 🌭 🥪 🍜 🍣 🍱 🥟 🍚 🍛 🍤 🍦 🍰 🎂 🍫 🍬 🍩 🍪 ☕ 🍵 🧋 🍺 🥂 🍷',
  },
  {
    key: 'objects',
    icon: '🎉',
    emojis:
      '⚽ 🏀 🏓 🎮 🎲 🎧 🎵 🎉 🎊 🎁 🎈 🏆 🥇 📱 💻 ⌚ 📷 💡 🔑 🔒 ✈️ 🚗 🚲 🏠 ⏰ 📅 📌 ✅ ❌ ❓ ❗ ⚠️ 🆗 🆒',
  },
];

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
}

export function EmojiPicker({ onPick }: EmojiPickerProps) {
  const [category, setCategory] = useState(CATEGORIES[0]?.key ?? 'smileys');
  const active = CATEGORIES.find((entry) => entry.key === category) ?? CATEGORIES[0];

  return (
    <Popover>
      <PopoverTrigger
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        aria-label={t.chat.emoji}
        title={t.chat.emoji}
      >
        <Smile />
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 gap-2 p-2">
        <div className="flex gap-1">
          {CATEGORIES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setCategory(entry.key)}
              className={cn(
                'flex size-8 items-center justify-center rounded-md text-lg hover:bg-muted',
                entry.key === category && 'bg-muted',
              )}
              aria-pressed={entry.key === category}
            >
              {entry.icon}
            </button>
          ))}
        </div>
        <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
          {active?.emojis.split(' ').map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onPick(emoji)}
              className="flex size-9 items-center justify-center rounded-md text-xl hover:bg-muted"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
