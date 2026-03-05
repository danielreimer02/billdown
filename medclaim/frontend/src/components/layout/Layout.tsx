import { Outlet, Link, useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "@/store/auth"
import { usePageTracking } from "@/hooks/usePageTracking"

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, guestRole, logout } = useAuth()

  // Track page views for site analytics
  usePageTracking()

  // Determine the correct "My Cases" link based on auth state
  const casesPath = user ? "/cases" : guestRole ? `/guest/${guestRole}` : "/cases"

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
              {navLink(casesPath, "My Cases")}
              {navLink("/next", "Protect Yourself for Next Time")}
              {navLink("/what-we-offer", "What We Offer")}
              <span className="w-px h-5 bg-gray-200" />
              {user ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {user.full_name || user.email}
                  </span>
                  <button
                    onClick={() => { logout(); navigate("/") }}
                    className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
                  >
                    Sign Out
                  </button>
                </div>
              ) : guestRole ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    👤 Guest
                  </span>
                  <button
                    onClick={() => { logout(); navigate("/") }}
                    className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
                  >
                    Exit Guest
                  </button>
                  <Link
                    to="/login?mode=register"
                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Create Account
                  </Link>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Sign In
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200 pt-10 pb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Footer grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pb-8 border-b border-gray-200">
            {/* Brand column */}
            <div className="col-span-2 md:col-span-1">
              <Link to="/" className="flex items-center gap-2 mb-3">
                <span className="text-2xl">🏥</span>
                <span className="text-lg font-bold text-gray-900">MedClaim</span>
              </Link>
              <p className="text-sm text-gray-500 leading-relaxed">
                Medical billing dispute automation. We help you understand, challenge, and reduce unfair medical charges.
              </p>
            </div>

            {/* Solutions column */}
            <div>
              <h4 className="text-xs font-semibold text-gray-900 mb-3 uppercase tracking-wider">Solutions</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/cases" className="text-gray-500 hover:text-blue-600 transition-colors">My Cases</Link></li>
                <li><Link to="/individuals" className="text-gray-500 hover:text-blue-600 transition-colors">For Individuals</Link></li>
                <li><Link to="/physicians" className="text-gray-500 hover:text-blue-600 transition-colors">For Physicians</Link></li>
                <li><Link to="/companies" className="text-gray-500 hover:text-blue-600 transition-colors">For Companies</Link></li>
                <li><Link to="/insurance-plans" className="text-gray-500 hover:text-blue-600 transition-colors">Compare Insurance Plans</Link></li>
              </ul>
            </div>

            {/* Resources column */}
            <div>
              <h4 className="text-xs font-semibold text-gray-900 mb-3 uppercase tracking-wider">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/start" className="text-gray-500 hover:text-blue-600 transition-colors">Getting Started</Link></li>
                <li><Link to="/next" className="text-gray-500 hover:text-blue-600 transition-colors">Protect Yourself for Next Time</Link></li>
                <li><Link to="/plans/glossary" className="text-gray-500 hover:text-blue-600 transition-colors">Insurance Glossary</Link></li>
                <li><Link to="/documents" className="text-gray-500 hover:text-blue-600 transition-colors">Document Guide</Link></li>
                <li><Link to="/what-we-offer" className="text-gray-500 hover:text-blue-600 transition-colors">What We Offer</Link></li>
              </ul>
            </div>

            {/* Admin column — right side */}
            <div>
              <h4 className="text-xs font-semibold text-gray-900 mb-3 uppercase tracking-wider">Admin</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/admin/cases" className="text-gray-500 hover:text-blue-600 transition-colors">All Cases</Link></li>
                <li><Link to="/admin/tools" className="text-gray-500 hover:text-blue-600 transition-colors">Internal Tools</Link></li>
                <li><Link to="/admin/data-analytics" className="text-gray-500 hover:text-blue-600 transition-colors">Data Analytics</Link></li>
                <li><Link to="/admin/site-analytics" className="text-gray-500 hover:text-blue-600 transition-colors">Site Analytics</Link></li>
                <li><Link to="/admin/site-maintenance" className="text-gray-500 hover:text-blue-600 transition-colors">Site Maintenance</Link></li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-5 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-gray-400">
            <p>© {new Date().getFullYear()} MedClaim. All rights reserved.</p>
            <p className="text-center max-w-xl leading-relaxed">
              MedClaim is not a law firm and does not provide legal advice. Information is provided
              for educational purposes based on publicly available federal and state law.
            </p>
            <a href="mailto:help@medclaim.app" className="text-gray-500 hover:text-blue-600 transition-colors">
              help@medclaim.app
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
