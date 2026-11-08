import { useContext } from 'react'
import { AuthContext } from '../state/authContext'

export function useAuth() {
  const v = useContext(AuthContext)
  if (!v) throw new Error('AuthProvider missing')
  return v
}
