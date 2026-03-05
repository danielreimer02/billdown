/**
 * AdminLogin — /admin/login
 *
 * Simple login form for admin users. On success, redirects to the
 * page they were trying to access (or /admin/cases by default).
 */

import { useState } from "react"
import { useNavigate, useLocation, Link } from "react-router-dom"
import { useAuth } from "@/store/auth"

export default function AdminLogin() {
  const { login, user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string })?.from ?? "/admin/cases"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // If already logged in as admin, redirect immediately
  if (user && isAdmin) {
    navigate(from, { replace: true })
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      // After login, check if role is admin — the auth store will update
      // and AdminRoute will allow access. We navigate optimistically.
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-white border rounded-xl shadow-sm p-8">
          <div className="text-center mb-6">
            <span className="text-3xl">🔒</span>
            <h1 className="text-xl font-bold mt-2">Admin Login</h1>
            <p className="text-sm text-gray-500 mt-1">
              Sign in with an admin account to continue.
            </p>
          </div>

          {/* Show message if user is logged in but not admin */}
          {user && !isAdmin && (
            <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-lg p-3 mb-4 text-sm">
              You're signed in as <strong>{user.email}</strong> but this account
              doesn't have admin access.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="admin@medclaim.app"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/" className="text-sm text-gray-500 hover:text-blue-600">
              ← Back to MedClaim
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
