import { useNavigate } from 'react-router-dom'
import { setInitiativeFilter } from './initiativeFilter'

// Take the user into a space - its notes, to-dos and lists (the Notes tab, narrowed to that space). `null` is Others.
export function useOpenSpace() {
  const navigate = useNavigate()
  return (spaceId: number | null) => {
    setInitiativeFilter(spaceId ?? -1, 'spaces')
    navigate('/notes')
  }
}
