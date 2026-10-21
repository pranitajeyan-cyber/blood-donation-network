import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { ApiError, api, readToken, writeToken } from '../api/client'
import type { LoginBody, RegisterBody, Role, TokenResponse, UserOut } from '../api/types'

interface AuthState {
  user: UserOut | null
  status: 'loading' | 'authenticated' | 'anonymous'
  signIn: (body: LoginBody) => Promise<UserOut>
  signUp: (body: RegisterBody) => Promise<UserOut>
  signOut: () => void
  refresh: () => Promise<void>
  /** Patch the cached profile after a successful self-update. */
  patchUser: (patch: Partial<UserOut>) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null)
  const [status, setStatus] = useState<AuthState['status']>('loading')

  const refresh = useCallback(async () => {
    if (!readToken()) {
      setUser(null)
      setStatus('anonymous')
      return
    }
    try {
      const me = await api.me()
      setUser(me)
      setStatus('authenticated')
    } catch (error) {
      // A 401 means the token is dead — clear it rather than looping.
      if (error instanceof ApiError && error.status === 401) writeToken(null)
      setUser(null)
      setStatus('anonymous')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const adopt = useCallback((payload: TokenResponse) => {
    writeToken(payload.access_token)
    setUser(payload.user)
    setStatus('authenticated')
    return payload.user
  }, [])

  const signIn = useCallback(
    async (body: LoginBody) => adopt(await api.login(body)),
    [adopt],
  )

  const signUp = useCallback(
    async (body: RegisterBody) => adopt(await api.register(body)),
    [adopt],
  )

  const signOut = useCallback(() => {
    writeToken(null)
    setUser(null)
    setStatus('anonymous')
  }, [])

  const patchUser = useCallback((patch: Partial<UserOut>) => {
    setUser((current) => (current ? { ...current, ...patch } : current))
  }, [])

  const value = useMemo<AuthState>(
    () => ({ user, status, signIn, signUp, signOut, refresh, patchUser }),
    [user, status, signIn, signUp, signOut, refresh, patchUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

/** Where a given role belongs once it signs in. */
export function landingPathFor(role: Role): string {
  if (role === 'admin') return '/admin'
  if (role === 'hospital') return '/hospital'
  return '/donor'
}
