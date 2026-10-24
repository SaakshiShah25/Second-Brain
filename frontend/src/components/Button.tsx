import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  block?: boolean
}

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent text-accent-contrast border-transparent',
  secondary: 'bg-bg-card text-text border-border-strong',
  ghost: 'bg-transparent text-text-muted border-transparent',
  danger: 'bg-bg-card text-danger border-border-strong',
}

// Heights follow mobile touch-target guidance: md is 44px (Apple HIG's
// minimum), lg is the 52px full-width call-to-action used in forms and
// sheets, sm is reserved for inline chips-with-actions inside a card.
const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-4 text-[0.9375rem]',
  lg: 'h-13 px-5 text-base',
}

export default function Button({ variant = 'secondary', size = 'md', block = false, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`pressable inline-flex items-center justify-center gap-1.5 rounded-full border font-medium disabled:cursor-not-allowed disabled:opacity-45 ${
        variants[variant]
      } ${sizes[size]} ${block ? 'w-full' : ''} ${className}`}
      {...props}
    />
  )
}
