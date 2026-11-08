import { createContext } from 'react'
import type { User } from '../lib/types'

export type AuthState = {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
  loginOwner: (login: string, password: string) => Promise<User>
  requestOtp: (phone: string) => Promise<{ sent: boolean; expiresInSeconds: number; retryAfterSeconds: number }>
  verifyOtp: (phone: string, code: string, name?: string) => Promise<User>
  legacyCustomerLogin: (name: string, phone: string) => Promise<User>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
