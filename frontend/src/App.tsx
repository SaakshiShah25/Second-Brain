import { Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DigestPage from './pages/DigestPage'
import ChatPage from './pages/ChatPage'
import PeopleListPage from './pages/PeopleListPage'
import PersonDetailPage from './pages/PersonDetailPage'
import NotesPage from './pages/NotesPage'
import SettingsPage from './pages/SettingsPage'
import AccountDeletionInfoPage from './pages/AccountDeletionInfoPage'
import PublicPrivacyPage from './pages/PublicPrivacyPage'
import { ChatSessionProvider } from './chat/ChatSessionContext'
import SettingsProvider from './settings/SettingsProvider'
import TermsGate from './legal/TermsGate'
import AppLockGate from './components/AppLockGate'
import TourGate from './components/TourGate'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Public, no-auth routes required for Play Store submission: a
          privacy policy URL reachable without signing in (for the store
          listing), and an account-deletion path reachable without the
          app installed (Google Play's account-deletion policy). See each
          page's own comment. */}
      <Route path="/account-deletion" element={<AccountDeletionInfoPage />} />
      <Route path="/privacy" element={<PublicPrivacyPage />} />
      <Route element={<RequireAuth />}>
        <Route
          element={
            <SettingsProvider>
              <TermsGate>
                <AppLockGate>
                  <TourGate>
                    <ChatSessionProvider>
                      <Layout />
                    </ChatSessionProvider>
                  </TourGate>
                </AppLockGate>
              </TermsGate>
            </SettingsProvider>
          }
        >
          <Route path="/" element={<ChatPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/digest" element={<DigestPage />} />
          <Route path="/people" element={<PeopleListPage />} />
          <Route path="/people/:personId" element={<PersonDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
