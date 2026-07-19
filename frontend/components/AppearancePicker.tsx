"use client";

import { Check } from "lucide-react";
import { CHAT_COLORS, WALLPAPER_PRESETS, classNames } from "@/lib/utils";

interface Props {
  chatColor: string | null;
  wallpaper: string | null;
  onChangeColor: (color: string | null) => void;
  onChangeWallpaper: (wallpaper: string | null) => void;
}

export default function AppearancePicker({ chatColor, wallpaper, onChangeColor, onChangeWallpaper }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 text-sm font-medium">Chat color</div>
        <div className="flex flex-wrap gap-2">
          {CHAT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onChangeColor(c)}
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: c }}
              aria-label={`Set chat color ${c}`}
            >
              {chatColor === c && <Check size={15} className="text-white" />}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-signal-textMuted">Only changes how your own messages look to you.</p>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">Wallpaper</div>
        <div className="flex flex-wrap gap-2">
          {WALLPAPER_PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => onChangeWallpaper(preset.value)}
              className={classNames(
                "flex h-10 w-14 items-center justify-center rounded-lg border text-[10px] text-white/80",
                wallpaper === preset.value ? "border-signal-blue" : "border-signal-border dark:border-signal-border-dark"
              )}
              style={{ backgroundColor: preset.value ?? undefined }}
              title={preset.label}
            >
              {wallpaper === preset.value ? <Check size={14} /> : preset.value ? "" : "Aa"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
