import { useState } from 'react'
import { Download, Share, SquarePlus } from 'lucide-react'
import { platform, useInstall } from '../lib/install'
import { ListGroup, ListRow } from './ListGroup'

const STEPS: Record<ReturnType<typeof platform>, string> = {
  ios: 'In Safari, tap the Share button, then “Add to Home Screen”. (Chrome on iPhone cannot install apps - open this page in Safari.)',
  android: 'In Chrome, tap the ⋮ menu at the top right, then “Install app” (or “Add to Home screen”). If neither shows, reload the page once and look again.',
  desktop: 'In Chrome, click the install icon at the right end of the address bar, or ⋮ → “Cast, save and share” → “Install page as app”.',
}

// Settings > Install app. One tap when Chrome has offered the install prompt; otherwise the exact steps for this
// browser. (A web page can't install itself without the browser's say-so - this is the closest to forcing it.)
export default function InstallSettings() {
  const { installed, canPrompt, install } = useInstall()
  const [showSteps, setShowSteps] = useState(false)
  const [note, setNote] = useState('')
  const where = platform()

  if (installed) {
    return (
      <ListGroup title="Install app">
        <ListRow icon={SquarePlus} iconColor="var(--sb-text-muted)" soft label="MyConfía is installed" detail="You're using it as an app" />
      </ListGroup>
    )
  }

  return (
    <ListGroup title="Install app" footer={note || (showSteps || !canPrompt ? STEPS[where] : undefined)}>
      {canPrompt ? (
        <ListRow
          icon={Download}
          iconColor="var(--sb-text-muted)"
          soft
          label="Install MyConfía"
          detail="Add it to your home screen"
          chevron
          onClick={async () => {
            const result = await install()
            if (result === 'dismissed') setNote('No problem - you can install it any time from here.')
            if (result === 'unavailable') setShowSteps(true)
          }}
        />
      ) : (
        <ListRow
          icon={where === 'ios' ? Share : Download}
          iconColor="var(--sb-text-muted)"
          soft
          label="Install MyConfía"
          detail="Your browser hasn't offered a one-tap install - steps below"
        />
      )}
    </ListGroup>
  )
}
