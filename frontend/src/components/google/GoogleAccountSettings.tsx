import { useState } from 'react'
import { CalendarDays, Check, FolderOpen, Unplug } from 'lucide-react'
import { startGoogleConnect, useDisconnectGoogle, useGoogleStatus, type GoogleFeature } from '../../api/google'
import { useAuth } from '../../auth/AuthContext'
import ConfirmDialog from '../ConfirmDialog'
import { ListGroup, ListRow } from '../ListGroup'
import { toast } from '../Toast'
import GoogleIcon from './GoogleIcon'

// Settings > Connected accounts: the ONE Google connection behind Calendar
// and Drive. Connecting grants both in a single consent screen; each can
// also be added later on its own (Google merges the grants).
export default function GoogleAccountSettings() {
  const { data: status } = useGoogleStatus()
  const { user } = useAuth()
  const disconnect = useDisconnectGoogle()
  const [confirming, setConfirming] = useState(false)
  const [starting, setStarting] = useState(false)
  if (!status) return null

  const signedInWithGoogle = user?.app_metadata?.provider === 'google'

  function connect(features: GoogleFeature[]) {
    setStarting(true)
    startGoogleConnect(features, 'settings').catch((e) => {
      setStarting(false)
      toast(e instanceof Error ? e.message : "Couldn't start the connection")
    })
  }

  const featureRow = (feature: GoogleFeature, label: string, detail: string, icon: typeof CalendarDays, color: string) => {
    const on = status.features.includes(feature)
    return (
      <ListRow
        icon={icon}
        iconColor={color}
        label={label}
        detail={detail}
        trailing={
          on ? (
            <span className="flex items-center gap-1 text-sm font-medium text-success">
              <Check size={16} strokeWidth={2.4} /> On
            </span>
          ) : (
            <button
              type="button"
              disabled={starting}
              onClick={() => connect([feature])}
              className="pressable h-8 rounded-full border border-border-strong px-3 text-sm font-medium disabled:opacity-50"
            >
              Turn on
            </button>
          )
        }
      />
    )
  }

  return (
    <>
      <ListGroup
        title="Connected accounts"
        footer={
          !status.configured
            ? 'Google isn’t set up on this server yet.'
            : status.connected
              ? 'MyConfía only reads Drive folders you add, and only adds Calendar events you ask for. Disconnecting never deletes anything in your Google account.'
              : 'One connection for both: put follow-ups on your Calendar, and bring Drive folders into Documents.'
        }
      >
        {!status.configured ? (
          <ListRow leading={<GoogleIcon size={18} />} label="Google" detail="Not available yet" />
        ) : !status.connected ? (
          <ListRow
            leading={<GoogleIcon size={18} />}
            label={starting ? 'Opening Google…' : 'Connect Google'}
            detail={signedInWithGoogle ? 'You signed in with Google — one tap adds Calendar & Drive' : 'Calendar and Drive in one step'}
            chevron
            disabled={starting}
            onClick={() => connect(['calendar', 'drive'])}
          />
        ) : (
          <>
            <ListRow leading={<GoogleIcon size={18} />} label="Google" detail={status.email ?? 'Connected'} />
            {featureRow('calendar', 'Calendar', 'Add follow-ups as events; today’s events in your brief', CalendarDays, '#2563eb')}
            {featureRow('drive', 'Drive', 'Bring folders into Documents', FolderOpen, '#d97706')}
            <ListRow icon={Unplug} iconColor="#e5383b" label="Disconnect Google" danger onClick={() => setConfirming(true)} />
          </>
        )}
      </ListGroup>

      {confirming && (
        <ConfirmDialog
          title="Disconnect Google?"
          message="Calendar sync stops and your Drive folders are removed from MyConfía. Nothing in your Google account is deleted."
          confirmLabel="Disconnect"
          busy={disconnect.isPending}
          busyLabel="Disconnecting…"
          onConfirm={() =>
            disconnect.mutate(undefined, {
              onSuccess: () => {
                setConfirming(false)
                toast('Google disconnected')
              },
            })
          }
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}
