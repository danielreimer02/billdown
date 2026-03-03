import { useState } from "react"
import { Outlet, Link, useLocation } from "react-router-dom"

export default function Layout() {
  const location = useLocation()
  const [showBanner, setShowBanner] = useState(true)

  function navLink(to: string, label: string, disabled = false) {
    const active = location.pathname === to || (to !== "/" && location.pathname.startsWith(to))
    if (disabled) {
      return (
        <span className="text-gray-400 cursor-not-allowed text-sm" title="Coming soon">
          {label}
        </span>
      )
    }
    return (
      <Link
        to={to}
        className={`hover:text-blue-600 transition-colors ${
          active ? "text-blue-600 font-semibold" : ""
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Warning banner */}
      {showBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center text-sm relative">
          <span className="text-amber-800">
            ⚠️ Do not pay your bill or sign any financing agreement before checking your rights.{" "}
            <a href="#warnings" className="underline font-semibold hover:text-amber-900">
              It may cost you everything — learn why&thinsp;↓
            </a>
          </span>
          <button
            onClick={() => setShowBanner(false)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400 hover:text-amber-600 text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-2xl">🏥</span>
              <span className="text-xl font-bold text-gray-900">MedClaim</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-gray-600">
              {navLink("/", "Home")}
              {navLink("/lcd", "LCD Lookup")}
              {navLink("/cases", "My Cases", true)}
            </nav>
          </div>
        </div>
      </header>

      {/* Main content — leave room for sticky CTA */}
      <main className="flex-1 pb-16">
        <Outlet />
      </main>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-gray-700 hidden sm:block">
            Have a medical bill right now?{" "}
            <span className="font-semibold">We'll review it free.</span>
          </p>
          <p className="text-sm text-gray-700 sm:hidden font-semibold">
            We'll review your bill free.
          </p>
          <Link
            to="/cases"
            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm shrink-0"
          >
            Submit My Bill →
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200 py-6 mb-14">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500 space-y-2">
          <p>MedClaim — Medical Billing Dispute Automation</p>
          <p>
            Contact:{" "}
            <a href="mailto:help@medclaim.app" className="text-blue-600 hover:underline">
              help@medclaim.app
            </a>
          </p>
          <p className="text-xs text-gray-400">
            MedClaim is not a law firm. This is not legal advice. Information is provided
            for educational purposes based on publicly available federal and state law.
          </p>
        </div>
      </footer>
    </div>
  )
}
