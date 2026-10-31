import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

// What to call the person. Kept in the Supabase account's own metadata (no database table): typed at signup or
// in Settings, or supplied by Google. An email address is not a reliable name ("sanket3shah"), so it is never
// used as one - without a saved name the greeting just says "Good evening".

/** The full name on the account, or ''. */
export function savedName(user: User | null | undefined): string {
  const meta = user?.user_metadata ?? {}
  return String(meta.full_name ?? meta.name ?? '').trim()
}

/** First word of the saved name, for the greeting. */
export function firstName(user: User | null | undefined): string {
  return savedName(user).split(/\s+/)[0] ?? ''
}

/** True when the app should ask once: no name saved and the question hasn't been answered or skipped. */
export function shouldAskName(user: User | null | undefined): boolean {
  return !!user && !savedName(user) && !user.user_metadata?.name_prompt_done
}

export async function saveName(name: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim(), name_prompt_done: true } })
  if (error) throw error
}

export async function skipNamePrompt(): Promise<void> {
  await supabase.auth.updateUser({ data: { name_prompt_done: true } })
}
