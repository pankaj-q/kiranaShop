import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import type { User } from '../lib/types'

type AuthState = {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
  loginOwner: (login: string, password: string) => Promise<User>
  requestOtp: (phone: string) => Promise<{ sent: boolean; expiresInSeconds: number; retryAfterSeconds: number }>
  verifyOtp: (phone: string, code: string, name?: string) => Promise<User>
  legacyCustomerLogin: (name: string, phone: string) => Promise<User>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await api<User>('/customer/me').catch(async () => {
        // try owner me
        return api<User>('/admin/me')
      })
      setUser(me)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const loginOwner = useCallback(async (login: string, password: string) => {
    const data = await api<{ user: User }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    })
    setUser(data.user)
    return data.user
  }, [])

  const requestOtp = useCallback(async (phone: string) => {
    return api<{ sent: boolean; expiresInSeconds: number; retryAfterSeconds: number }>(
      '/customer/otp/request',
      { method: 'POST', body: JSON.stringify({ phone }) },
    )
  }, [])

  const verifyOtp = useCallback(async (phone: string, code: string, name?: string) => {
    const data = await api<{ user: User }>('/customer/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code, name }),
    })
    setUser(data.user)
    return data.user
  }, [])

  const legacyCustomerLogin = useCallback(async (name: string, phone: string) => {
    const data = await api<{ user: User }>('/customer/session', {
      method: 'POST',
      body: JSON.stringify({ name, phone }),
    })
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    if (user?.role === 'OWNER') await api('/admin/logout', { method: 'POST' }).catch(() => {})
    else await api('/customer/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }, [user])

  return (
    <Ctx.Provider value={{ user, loading, refresh, loginOwner, requestOtp, verifyOtp, legacyCustomerLogin, logout }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('AuthProvider missing')
  return v
}
