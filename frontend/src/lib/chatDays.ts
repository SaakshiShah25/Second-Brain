import type { ChatMessage } from '../api/types'
import { isoLocal } from './dates'

export interface ChatDay {
  key: string
  label: string
  items: { message: ChatMessage; index: number }[] // `index` is the message's place in the whole chat
}

/** "Today · Fri 27 Nov", "Yesterday · Thu 26 Nov", "Wed 25 Nov" (with the year when it isn't this one). */
export function chatDayLabel(sentAt: Date, now: Date = new Date()): string {
  const date = sentAt
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(sentAt.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) })
    .replace(',', '')
  if (isoLocal(sentAt) === isoLocal(now)) return `Today · ${date}`
  if (isoLocal(sentAt) === isoLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return `Yesterday · ${date}`
  return date
}

/** The chat split where the day changes. Messages saved before times were recorded have no day that can be known, so
 *  they are grouped as "Earlier" - never given a guessed date. */
export function groupChatByDay(messages: ChatMessage[], now: Date = new Date()): ChatDay[] {
  const days: ChatDay[] = []
  let current = ''
  messages.forEach((message, index) => {
    const sentAt = message.at ? new Date(message.at) : null
    const day = sentAt && !Number.isNaN(sentAt.getTime()) ? isoLocal(sentAt) : 'earlier'
    if (!days.length || day !== current) {
      current = day
      days.push({ key: `${day}-${index}`, label: day === 'earlier' ? 'Earlier' : chatDayLabel(sentAt!, now), items: [] })
    }
    days[days.length - 1].items.push({ message, index })
  })
  return days
}
