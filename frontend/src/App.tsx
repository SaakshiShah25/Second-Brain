import { Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DigestPage from './pages/DigestPage'
import ChatPage from './pages/ChatPage'
import PeopleListPage from './pages/PeopleListPage'
import PersonDetailPage from './pages/PersonDetailPage'
import ClientsPage from './pages/ClientsPage'
import ClientDetailPage from './pages/ClientDetailPage'
import SettingsPage from './pages/SettingsPage'
import { ChatSessionProvider } from './chat/ChatSessionContext'
import SettingsProvider from './settings/SettingsProvider'
import TermsGate from './legal/TermsGate'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route
          element={
            <SettingsProvider>
              <TermsGate>
                <ChatSessionProvider>
                  <Layout />
                </ChatSessionProvider>
              </TermsGate>
            </SettingsProvider>
          }
        >
          <Route path="/" element={<ChatPage />} />
          <Route path="/digest" element={<DigestPage />} />
          <Route path="/people" element={<PeopleListPage />} />
          <Route path="/people/:personId" element={<PersonDetailPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:clientId" element={<ClientDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
