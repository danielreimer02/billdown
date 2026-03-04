import { Outlet, Link, useLocation } from "react-router-dom"

export default function Layout() {
  const location = useLocation()

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
              {navLink("/start", "Where Do I Start?")}
              {navLink("/cases", "My Cases")}
              {navLink("/next", "Protect Yourself for Next Time")}
              {navLink("/physicians", "For Physicians")}
              {navLink("/companies", "For Companies")}
              <span className="w-px h-5 bg-gray-300" />
              {navLink("/tools", "Internal Tools")}
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200 py-6">
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
