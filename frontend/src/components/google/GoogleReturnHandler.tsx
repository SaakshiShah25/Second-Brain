import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '../Toast'

const MESSAGES: Record<string, string> = {
  cancelled: 'Google connection cancelled',
  error: "Couldn't connect Google — please try again",
  expired: 'That link expired — please connect again',
}

// Google's consent screen sends the user back to the screen they started
// from with ?google=connected|cancelled|error (api/routers/google.py).
// Shows the outcome once, refreshes anything Google-backed, and clears
// the parameter so a refresh doesn't repeat it. Mounted once in Layout.
export default function GoogleReturnHandler() {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()
  const result = params.get('google')

  useEffect(() => {
    if (!result) return
    if (result === 'connected') {
      const features = (params.get('features') || '').split(',').filter(Boolean)
      const named = features.map((f) => (f === 'drive' ? 'Drive' : 'Calendar')).join(' & ')
      toast(named ? `Google ${named} connected` : 'Google connected')
      queryClient.invalidateQueries({ queryKey: ['google'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      queryClient.invalidateQueries({ queryKey: ['brief'] })
    } else {
      toast(MESSAGES[result] ?? MESSAGES.error)
    }
    const next = new URLSearchParams(params)
    next.delete('google')
    next.delete('features')
    setParams(next, { replace: true })
  }, [result, params, setParams, queryClient])

  return null
}
