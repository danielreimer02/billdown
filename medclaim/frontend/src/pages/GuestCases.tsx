/**
 * GuestCases — /guest/individual
 *
 * Same Cases experience but with a subtle guest banner at top.
 * The actual Cases component already works without auth (unauthenticated mode
 * talks to backend without a token). This wrapper just adds context.
 */

import { Link, useNavigate } from "react-router-dom"
import Cases from "@/pages/Cases"
import { useAuth } from "@/store/auth"

export default function GuestCases() {
  const { guestRole, logout } = useAuth()
  const navigate = useNavigate()

  function exitGuest() {
    logout()          // clears guest role + any token from localStorage
    navigate("/")     // back to home
  }

  return (
    <div>
      {/* Guest banner */}
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between">
          <p className="text-xs text-amber-700">
            <span className="font-medium">👤 Guest mode</span>
            {" · "}
            {guestRole === "individual" ? "Individual" : guestRole ?? "Guest"}
            {" · Cases are saved on the server but not linked to an account."}
          </p>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={exitGuest}
              className="text-xs font-medium text-gray-600 border border-gray-300 px-3 py-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Exit Guest Mode
            </button>
            <Link
              to="/login?mode=register"
              className="text-xs font-medium text-amber-800 bg-amber-100 border border-amber-300 px-3 py-1 rounded-lg hover:bg-amber-200 transition-colors"
            >
              Create Account to Save
            </Link>
          </div>
        </div>
      </div>

      {/* Render the full Cases page */}
      <Cases />
    </div>
  )
}
