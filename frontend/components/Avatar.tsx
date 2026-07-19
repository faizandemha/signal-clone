"use client";

import { initials, classNames } from "@/lib/utils";

interface AvatarProps {
  name: string;
  color: string;
  size?: number;
  online?: boolean;
  showPresence?: boolean;
}

export default function Avatar({ name, color, size = 40, online, showPresence }: AvatarProps) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="flex h-full w-full items-center justify-center rounded-full font-medium text-white select-none"
        style={{ backgroundColor: color, fontSize: size * 0.38 }}
      >
        {initials(name)}
      </div>
      {showPresence && (
        <span
          className={classNames(
            "absolute bottom-0 right-0 rounded-full border-2 border-white dark:border-signal-sidebar-dark",
            online ? "bg-green-500" : "bg-gray-400"
          )}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </div>
  );
}
