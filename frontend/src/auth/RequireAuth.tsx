import { Navigate, Outlet } from 'react-router-dom'
import LoadingScreen from '../components/LoadingScreen'
import { useAuth } from './AuthContext'

export default function RequireAuth() {
  const { session, loading } = useAuth()

  if (loading) {
    return <LoadingScreen />
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
