import { Brain } from 'lucide-react'

export default function TypingIndicator() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Brain size={15} strokeWidth={2} />
      </div>
      <div className="flex items-center gap-1 py-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-text-faint"
            style={{ animation: 'typing-bounce 1.2s infinite', animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}
