import { useNavigate } from "react-router-dom"
import { useAuth, type UserRole } from "@/store/auth"

const ROLES: {
  value: UserRole
  label: string
  icon: string
  desc: string
  color: string
  enabled: boolean
  route: string
}[] = [
  {
    value: "individual",
    label: "Individual",
    icon: "👤",
    desc: "I have a medical bill I want to review, dispute, or reduce. No account needed — your cases are saved in this browser.",
    color: "border-blue-400 bg-blue-50 hover:border-blue-500 hover:shadow-md",
    enabled: true,
    route: "/guest/individual",
  },
  {
    value: "physician",
    label: "Physician",
    icon: "⚕️",
    desc: "I need tools for prior authorization, denial appeals, and LCD/NCD coverage lookups.",
    color: "border-gray-200 bg-gray-50",
    enabled: false,
    route: "/guest/physician",
  },
  {
    value: "employee",
    label: "Employee",
    icon: "🏢",
    desc: "My employer offers MedClaim as a benefit. I want to review bills and submit disputes.",
    color: "border-gray-200 bg-gray-50",
    enabled: false,
    route: "/guest/employee",
  },
  {
    value: "company",
    label: "Company",
    icon: "🏛️",
    desc: "I want to evaluate MedClaim for my organization's employees and healthcare cost reduction.",
    color: "border-gray-200 bg-gray-50",
    enabled: false,
    route: "/guest/company",
  },
]

export default function GuestRolePicker() {
  const navigate = useNavigate()
  const { setGuestRole } = useAuth()

  function pick(role: typeof ROLES[number]) {
    if (!role.enabled) return
    setGuestRole(role.value)
    navigate(role.route)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="text-center mb-10">
        <span className="text-4xl">🏥</span>
        <h1 className="text-2xl font-bold mt-3">How will you use MedClaim?</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
          Choose your role to get started. Your data stays in this browser — no account required.
          You can create an account later to sync across devices.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ROLES.map(role => (
          <button
            key={role.value}
            onClick={() => pick(role)}
            disabled={!role.enabled}
            className={`text-left p-5 rounded-xl border-2 transition-all ${role.color} ${
              !role.enabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{role.icon}</span>
              <div>
                <h3 className="font-semibold text-gray-900">{role.label}</h3>
                {!role.enabled && (
                  <span className="text-[10px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                    Coming Soon
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{role.desc}</p>
          </button>
        ))}
      </div>

      <div className="text-center mt-8 space-y-2">
        <p className="text-xs text-gray-400">
          Guest mode saves your data locally in this browser. Create a free account to access your cases from any device.
        </p>
        <button
          onClick={() => navigate("/login?mode=register")}
          className="text-sm text-blue-600 font-medium hover:underline"
        >
          Create a free account instead →
        </button>
      </div>
    </div>
  )
}
