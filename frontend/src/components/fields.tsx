import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

// 16px text (text-base) on every field is deliberate, not a style pick:
// iOS Safari auto-zooms the whole page into any input under 16px on
// focus, and doesn't zoom back out - the single most "this is a website,
// not an app" moment on a phone.
const fieldClass =
  'w-full rounded-xl border border-border-strong bg-bg-card px-3.5 py-3 text-base text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className ?? ''}`} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldClass} ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClass} appearance-auto ${props.className ?? ''}`} />
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-[0.8125rem] font-medium text-text-muted">{children}</label>
}
