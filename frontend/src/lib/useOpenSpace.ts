import { useNavigate } from 'react-router-dom'
import { setInitiativeFilter } from './initiativeFilter'

// Which part of the space to land on (a phone shows Notes, To-dos and Lists as swipeable pages). Said once, read once.
const SECTION_KEY = 'confia.space-section'
export function takeSpaceSection(): string | null {
  try {
    const v = sessionStorage.getItem(SECTION_KEY)
    sessionStorage.removeItem(SECTION_KEY)
    return v
  } catch {
    return null
  }
}

// Take the user into a space - its notes, to-dos and lists (the Notes tab, narrowed to that space). `null` is Others.
// `section` picks the part to open on: a to-do tapped in a chat receipt lands on the space's To-dos, not its Notes.
export function useOpenSpace() {
  const navigate = useNavigate()
  return (spaceId: number | null, section?: 'notes' | 'todos' | 'lists') => {
    setInitiativeFilter(spaceId ?? -1, 'spaces')
    try {
      if (section) sessionStorage.setItem(SECTION_KEY, section)
    } catch {
      // private mode: it just opens on the first page
    }
    navigate('/notes')
  }
}
