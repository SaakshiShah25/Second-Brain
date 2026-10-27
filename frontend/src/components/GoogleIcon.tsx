// Google's multicolour "G" - used on Sign in with Google and the
// Google account connection rows.
export default function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20.5H24v7h11.3c-1.6 4.5-5.9 7.5-11.3 7.5-6.9 0-12.5-5.6-12.5-12.5S17.1 10 24 10c3.1 0 5.9 1.1 8.1 3l5-5C33.5 4.9 29 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l5.7 4.2C13.5 15.1 18.4 12 24 12c3.1 0 5.9 1.1 8.1 3l5-5C33.5 6.9 29 5 24 5c-7.8 0-14.5 4.4-17.7 10.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 43c5 0 9.4-1.8 12.8-4.7l-5.9-5c-1.9 1.4-4.3 2.2-6.9 2.2-5.4 0-9.7-3-11.3-7.4l-5.9 4.6C9.5 38.5 16.2 43 24 43z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20.5H24v7h11.3c-.8 2.2-2.2 4.1-4.1 5.4l5.9 5C40.9 34.9 44 30.2 44 24c0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}
