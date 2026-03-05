/**
 * Auth store — manages user session via localStorage + React context.
 *
 * Works without any state management library — just React hooks.
 * Token is stored in localStorage so it persists across tabs / refreshes.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { getGuestId, clearGuestId, ensureGuestId } from "@/lib/api"

const API = import.meta.env.VITE_API_URL ?? ""

// ── Types ──

export type UserRole = "individual" | "employee" | "physician" | "company" | "admin"

export interface AuthUser {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  company_name: string | null
  npi: string | null
  is_active: boolean
  created_at: string | null
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  guestRole: UserRole | null
  loading: boolean
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => void
  setGuestRole: (role: UserRole) => void
}

export interface RegisterData {
  email: string
  password: string
  full_name?: string
  role?: UserRole
  company_name?: string
  npi?: string
}

// ── Context ──

const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  guestRole: null,
  loading: true,
  isAdmin: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  setGuestRole: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

// ── Provider ──

const TOKEN_KEY = "mc_token"
const USER_KEY = "mc_user"
const GUEST_ROLE_KEY = "mc_guest_role"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [guestRole, setGuestRoleState] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  // Hydrate from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY)
    const savedUser = localStorage.getItem(USER_KEY)
    const savedGuestRole = localStorage.getItem(GUEST_ROLE_KEY) as UserRole | null
    if (savedToken && savedUser) {
      try {
        setToken(savedToken)
        setUser(JSON.parse(savedUser))
      } catch {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
      }
    }
    if (savedGuestRole) setGuestRoleState(savedGuestRole)
    setLoading(false)
  }, [])

  // Persist changes
  function persist(t: string, u: AuthUser) {
    localStorage.setItem(TOKEN_KEY, t)
    localStorage.setItem(USER_KEY, JSON.stringify(u))
    setToken(t)
    setUser(u)
  }

  // ── Login ──
  const login = useCallback(async (email: string, password: string) => {
    const gid = getGuestId()
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(gid ? { "X-Guest-ID": gid } : {}),
      },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || "Login failed")
    }
    const data = await res.json()
    clearGuestId()
    persist(data.access_token, data.user)
  }, [])

  // ── Register ──
  const register = useCallback(async (body: RegisterData) => {
    const gid = getGuestId()
    const res = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(gid ? { "X-Guest-ID": gid } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || "Registration failed")
    }
    const data = await res.json()
    clearGuestId()
    persist(data.access_token, data.user)
  }, [])

  // ── Logout ──
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(GUEST_ROLE_KEY)
    clearGuestId()
    setToken(null)
    setUser(null)
    setGuestRoleState(null)
  }, [])

  // ── Guest mode ──
  const setGuestRole = useCallback((role: UserRole) => {
    ensureGuestId()  // create guest_id on entering guest mode
    localStorage.setItem(GUEST_ROLE_KEY, role)
    setGuestRoleState(role)
  }, [])

  const isAdmin = user?.role === "admin"

  return (
    <AuthContext.Provider value={{ user, token, guestRole, loading, isAdmin, login, register, logout, setGuestRole }}>
      {children}
    </AuthContext.Provider>
  )
}
