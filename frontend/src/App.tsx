import { Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DigestPage from './pages/DigestPage'
import ChatPage from './pages/ChatPage'
import PeopleListPage from './pages/PeopleListPage'
import PersonDetailPage from './pages/PersonDetailPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DigestPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/people" element={<PeopleListPage />} />
          <Route path="/people/:personId" element={<PersonDetailPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
