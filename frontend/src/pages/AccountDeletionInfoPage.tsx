import { Link } from 'react-router-dom'

// Public, no-login page satisfying Google Play's account-deletion policy:
// apps that support creating an account must offer a way to request
// deletion that's reachable WITHOUT opening/installing the app (e.g. for
// someone who already uninstalled, or lost access to their login) - this
// is exactly that page, linked from the Play Store listing's data-safety
// section. The in-app path (Settings > Danger zone > Delete account,
// SettingsPage.tsx) stays the primary, instant, self-serve way to do
// this; this page is the required fallback for when that's not possible.
//
// TODO before Play Store submission: replace the placeholder support
// email below with the actual monitored inbox for deletion requests.
const SUPPORT_EMAIL = 'support@example.com'

export default function AccountDeletionInfoPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12 text-text">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Delete your account and data</h1>

      <p className="mb-3 text-[15px] leading-relaxed text-text-muted">
        You can permanently delete your Confía account and everything tied to it - every note, contact, and
        task - at any time, whether or not you still have the app installed.
      </p>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-text-muted">If you can still log in</h2>
      <p className="mb-3 text-[15px] leading-relaxed text-text-muted">
        Open Confía, go to <span className="font-medium text-text">Settings</span>, and use{' '}
        <span className="font-medium text-text">Danger zone → Delete account</span>. This deletes everything
        immediately - there's no waiting period.
      </p>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-text-muted">If you can't log in anymore</h2>
      <p className="mb-3 text-[15px] leading-relaxed text-text-muted">
        Email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>{' '}
        from the address you signed up with, asking us to delete your account. We'll verify it's you and
        complete the deletion within 30 days.
      </p>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-text-muted">What gets deleted</h2>
      <p className="mb-3 text-[15px] leading-relaxed text-text-muted">
        Your login, every note and contact you've logged, all tasks and follow-ups, calendar sync
        credentials, and your app preferences. This is permanent and can't be reversed.
      </p>

      <Link to="/login" className="mt-8 text-sm text-accent underline">
        Back to Confía
      </Link>
    </div>
  )
}
