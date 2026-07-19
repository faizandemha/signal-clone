export default function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1 text-xs text-signal-textMuted">
      <div className="flex items-center gap-1 rounded-2xl bg-signal-bubbleIn px-3 py-2 dark:bg-signal-bubbleIn-dark">
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-gray-500" style={{ animationDelay: "0ms" }} />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-gray-500" style={{ animationDelay: "150ms" }} />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-gray-500" style={{ animationDelay: "300ms" }} />
      </div>
      {label && <span>{label}</span>}
    </div>
  );
}
