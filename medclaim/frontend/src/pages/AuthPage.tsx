import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useAuth, type UserRole } from "@/store/auth"

const ROLES: { value: UserRole; label: string; icon: string; desc: string }[] = [
  { value: "individual", label: "Individual", icon: "👤", desc: "I have a medical bill to dispute" },
  { value: "employee", label: "Employee", icon: "🏢", desc: "My employer offers MedClaim" },
  { value: "physician", label: "Physician", icon: "⚕️", desc: "I need prior auth / appeal tools" },
  { value: "company", label: "Company", icon: "🏛️", desc: "I want to offer MedClaim to employees" },
]

export default function AuthPage() {
  const [searchParams] = useSearchParams()
  const defaultMode = searchParams.get("mode") === "register" ? "register" : "login"
  const [mode, setMode] = useState<"login" | "register">(defaultMode)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [role, setRole] = useState<UserRole>("individual")
  const [companyName, setCompanyName] = useState("")
  const [npi, setNpi] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const { login, register } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      if (mode === "login") {
        await login(email, password)
      } else {
        await register({
          email,
          password,
          full_name: fullName || undefined,
          role,
          company_name: companyName || undefined,
          npi: npi || undefined,
        })
      }
      navigate("/cases")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="text-center mb-8">
        <span className="text-4xl">🏥</span>
        <h1 className="text-2xl font-bold mt-2">
          {mode === "login" ? "Welcome Back" : "Create Your Account"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {mode === "login"
            ? "Sign in to access your cases and tools"
            : "Join MedClaim to start fighting unfair medical bills"}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Role selector (register only) */}
        {mode === "register" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">I am a…</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    role === r.value
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span className="text-lg">{r.icon}</span>
                  <div className="text-sm font-medium mt-0.5">{r.label}</div>
                  <div className="text-[10px] text-gray-500 leading-tight">{r.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Full name (register only) */}
        {mode === "register" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Dr. Jane Smith"
            />
          </div>
        )}

        {/* Company name (company/employee) */}
        {mode === "register" && (role === "company" || role === "employee") && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Acme Corp"
            />
          </div>
        )}

        {/* NPI (physician) */}
        {mode === "register" && role === "physician" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">NPI Number</label>
            <input
              type="text"
              value={npi}
              onChange={e => setNpi(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="1234567890"
              maxLength={10}
            />
          </div>
        )}

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="you@example.com"
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder={mode === "login" ? "••••••••" : "At least 8 characters"}
            minLength={mode === "register" ? 8 : undefined}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {submitting
            ? "Please wait…"
            : mode === "login"
            ? "Sign In"
            : "Create Account"}
        </button>
      </form>

      {/* Toggle mode */}
      <p className="text-center text-sm text-gray-500 mt-6">
        {mode === "login" ? (
          <>
            Don't have an account?{" "}
            <button
              onClick={() => { setMode("register"); setError("") }}
              className="text-blue-600 font-medium hover:underline"
            >
              Sign up free
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              onClick={() => { setMode("login"); setError("") }}
              className="text-blue-600 font-medium hover:underline"
            >
              Sign in
            </button>
          </>
        )}
      </p>

      {/* Skip / continue as guest */}
      <div className="text-center mt-4">
        <Link to="/guest" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
          Continue as guest →
        </Link>
      </div>
    </div>
  )
}
