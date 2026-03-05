/**
 * AdminRoute — protects child routes behind admin authentication.
 *
 * If the user is not logged in or not an admin, redirects to /admin/login.
 * Shows a loading spinner while auth state is hydrating.
 */

import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "@/store/auth"

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}
