// Notes saved before the backend cleaned them can start with a list marker the
// model left behind ("- Scrum call at 10 AM") - dropped when showing them.
export function stripBullet(text: string | null | undefined): string {
  return (text ?? '').replace(/^[\s\-–—•*]+/, '').trim()
}
