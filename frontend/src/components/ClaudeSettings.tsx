import { useState } from 'react'
import { Check, Copy, Plug, Unplug } from 'lucide-react'
import { api } from '../api/client'
import ConfirmDialog from './ConfirmDialog'
import { ListGroup, ListRow } from './ListGroup'
import { toast } from './Toast'

// Settings > Claude: the address to add to Claude (Settings > Connectors > Add custom connector), and a way to cut every
// Claude connection off at once (api/routers/mcp_oauth.py: /mcp/oauth/disconnect).
const MCP_URL = `${import.meta.env.VITE_API_URL ?? ''}/mcp`

export default function ClaudeSettings() {
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(MCP_URL)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast(MCP_URL) // can't copy here: show it to be copied by hand
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await api.post('/mcp/oauth/disconnect')
      toast('Claude has been disconnected')
      setConfirming(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't disconnect - please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ListGroup
        title="Use MyConfía in Claude"
        footer="In Claude, open Settings, then Connectors, then Add custom connector, and paste this address. Sign in here when Claude sends you, and your to-dos, notes and spaces are available right in the chat."
      >
        <ListRow
          icon={Plug}
          iconColor="var(--sb-text-muted)"
          soft
          label="Connector address"
          detail={MCP_URL}
          trailing={copied ? <Check size={18} strokeWidth={2.4} className="text-accent" /> : <Copy size={18} strokeWidth={2} className="text-text-muted" />}
          onClick={copy}
        />
        <ListRow icon={Unplug} iconColor="var(--sb-danger)" soft danger label="Disconnect Claude" detail="Cuts off every connected Claude right away" chevron onClick={() => setConfirming(true)} />
      </ListGroup>
      {confirming && (
        <ConfirmDialog
          title="Disconnect Claude?"
          message="Claude will lose access to your MyConfía straight away, on every device. You can connect it again later."
          confirmLabel="Disconnect"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={disconnect}
        />
      )}
    </>
  )
}
