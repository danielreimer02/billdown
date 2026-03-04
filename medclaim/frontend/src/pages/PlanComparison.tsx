import { useState, useMemo } from "react"
import { Link } from "react-router-dom"

/**
 * PlanComparison — /plans
 *
 * Compare health insurance plans side-by-side for individuals and companies.
 *
 * Tabs:
 *  1. Individual — add personal / ACA marketplace plans, compare costs
 *  2. Company / Group — compare employer-sponsored group plan options
 *
 * Features:
 *  - Add unlimited plans with full benefit details
 *  - Side-by-side comparison table
 *  - Annual cost estimator based on expected utilization
 *  - Visual scoring / recommendation
 *  - Persist plans in localStorage
 */

// ── Types ──

type MetalTier = "catastrophic" | "bronze" | "silver" | "gold" | "platinum" | "other"
type NetworkType = "hmo" | "ppo" | "epo" | "pos" | "hdhp" | "other"
type PlanMode = "individual" | "company"

interface Plan {
  id: string
  name: string
  carrier: string
  metalTier: MetalTier
  networkType: NetworkType
  monthlyPremium: number
  annualDeductible: number
  familyDeductible: number | null
  oopMax: number
  familyOopMax: number | null
  copayPrimary: number        // $ per PCP visit
  copaySpecialist: number     // $ per specialist visit
  copayUrgentCare: number
  copayER: number
  coinsurance: number         // 0-100 (e.g., 20 means you pay 20%)
  rxGeneric: number           // $ copay
  rxPreferred: number
  rxSpecialty: number | null
  hsaEligible: boolean
  telehealth: number | null
  mentalHealth: number | null // copay for mental health visit
  notes: string
  // Company-specific
  employerContribution: number | null   // $ / month employer pays toward premium
  employeeCost: number | null           // $ / month employee pays
}

const BLANK_PLAN: Plan = {
  id: "",
  name: "",
  carrier: "",
  metalTier: "silver",
  networkType: "ppo",
  monthlyPremium: 0,
  annualDeductible: 0,
  familyDeductible: null,
  oopMax: 0,
  familyOopMax: null,
  copayPrimary: 0,
  copaySpecialist: 0,
  copayUrgentCare: 0,
  copayER: 0,
  coinsurance: 20,
  rxGeneric: 0,
  rxPreferred: 0,
  rxSpecialty: null,
  hsaEligible: false,
  telehealth: null,
  mentalHealth: null,
  notes: "",
  employerContribution: null,
  employeeCost: null,
}

interface UsageProfile {
  label: string
  pcpVisits: number
  specialistVisits: number
  erVisits: number
  urgentCareVisits: number
  rxGenericFills: number
  rxPreferredFills: number
  majorEvent: boolean // e.g. surgery / hospitalization hitting deductible + coinsurance
  majorEventCost: number // total billed cost before insurance
}

const USAGE_PROFILES: UsageProfile[] = [
  {
    label: "Healthy — Minimal Use",
    pcpVisits: 2,
    specialistVisits: 0,
    erVisits: 0,
    urgentCareVisits: 0,
    rxGenericFills: 0,
    rxPreferredFills: 0,
    majorEvent: false,
    majorEventCost: 0,
  },
  {
    label: "Moderate — Regular Care",
    pcpVisits: 4,
    specialistVisits: 2,
    erVisits: 0,
    urgentCareVisits: 1,
    rxGenericFills: 12,
    rxPreferredFills: 0,
    majorEvent: false,
    majorEventCost: 0,
  },
  {
    label: "Active — Frequent Care",
    pcpVisits: 6,
    specialistVisits: 4,
    erVisits: 1,
    urgentCareVisits: 2,
    rxGenericFills: 12,
    rxPreferredFills: 6,
    majorEvent: false,
    majorEventCost: 0,
  },
  {
    label: "High Use — Major Event",
    pcpVisits: 6,
    specialistVisits: 6,
    erVisits: 2,
    urgentCareVisits: 2,
    rxGenericFills: 12,
    rxPreferredFills: 12,
    majorEvent: true,
    majorEventCost: 50000,
  },
]

const METAL_COLORS: Record<MetalTier, string> = {
  catastrophic: "bg-gray-100 text-gray-700",
  bronze: "bg-amber-100 text-amber-800",
  silver: "bg-gray-200 text-gray-700",
  gold: "bg-yellow-100 text-yellow-800",
  platinum: "bg-blue-100 text-blue-800",
  other: "bg-purple-100 text-purple-700",
}

const METAL_LABELS: Record<MetalTier, string> = {
  catastrophic: "Catastrophic",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  other: "Other / Custom",
}

const NET_LABELS: Record<NetworkType, string> = {
  hmo: "HMO",
  ppo: "PPO",
  epo: "EPO",
  pos: "POS",
  hdhp: "HDHP",
  other: "Other",
}

// ── Helpers ──

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function loadPlans(key: string): Plan[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePlans(key: string, plans: Plan[]) {
  localStorage.setItem(key, JSON.stringify(plans))
}

function estimateAnnualCost(plan: Plan, usage: UsageProfile, isCompany: boolean): number {
  const premium = isCompany && plan.employeeCost != null
    ? plan.employeeCost * 12
    : plan.monthlyPremium * 12

  let outOfPocket = 0

  // Copays (before deductible for many plans, but we simplify)
  outOfPocket += usage.pcpVisits * plan.copayPrimary
  outOfPocket += usage.specialistVisits * plan.copaySpecialist
  outOfPocket += usage.erVisits * plan.copayER
  outOfPocket += usage.urgentCareVisits * plan.copayUrgentCare
  outOfPocket += usage.rxGenericFills * plan.rxGeneric
  outOfPocket += usage.rxPreferredFills * plan.rxPreferred

  // Major event — deductible + coinsurance
  if (usage.majorEvent && usage.majorEventCost > 0) {
    const afterDeductible = Math.max(usage.majorEventCost - plan.annualDeductible, 0)
    const coinsuranceCost = afterDeductible * (plan.coinsurance / 100)
    outOfPocket += plan.annualDeductible + coinsuranceCost
  }

  // Cap at OOP max
  outOfPocket = Math.min(outOfPocket, plan.oopMax)

  return premium + outOfPocket
}

// ── Component ──

export default function PlanComparison() {
  const [mode, setMode] = useState<PlanMode>("individual")
  const [plans, setPlans] = useState<Plan[]>(() => loadPlans("mc_plans_individual"))
  const [companyPlans, setCompanyPlans] = useState<Plan[]>(() => loadPlans("mc_plans_company"))
  const [editing, setEditing] = useState<Plan | null>(null)
  const [usageIdx, setUsageIdx] = useState(1) // moderate
  const [view, setView] = useState<"cards" | "compare" | "cost">("cards")

  const activePlans = mode === "individual" ? plans : companyPlans
  const setActivePlans = (p: Plan[]) => {
    if (mode === "individual") {
      setPlans(p)
      savePlans("mc_plans_individual", p)
    } else {
      setCompanyPlans(p)
      savePlans("mc_plans_company", p)
    }
  }

  function addPlan() {
    setEditing({ ...BLANK_PLAN, id: uid() })
  }

  function savePlan(plan: Plan) {
    const existing = activePlans.find(p => p.id === plan.id)
    if (existing) {
      setActivePlans(activePlans.map(p => p.id === plan.id ? plan : p))
    } else {
      setActivePlans([...activePlans, plan])
    }
    setEditing(null)
  }

  function deletePlan(id: string) {
    setActivePlans(activePlans.filter(p => p.id !== id))
  }

  // Cost estimates for comparison
  const costEstimates = useMemo(() => {
    const usage = USAGE_PROFILES[usageIdx]
    return activePlans.map(p => ({
      plan: p,
      annualCost: estimateAnnualCost(p, usage, mode === "company"),
    })).sort((a, b) => a.annualCost - b.annualCost)
  }, [activePlans, usageIdx, mode])

  const cheapest = costEstimates.length ? costEstimates[0].annualCost : 0

  return (
    <div className="max-w-7xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-1">Health Insurance Plan Comparison</h1>
      <p className="text-gray-600 text-sm mb-2">
        Add your plan options, compare them side-by-side, and estimate which one
        will actually cost you the least based on how much care you expect to use.
      </p>
      <p className="text-sm mb-6">
        <Link to="/plans/glossary" className="text-blue-600 hover:underline font-medium">
          📖 Not sure what these terms mean? Read our Insurance Glossary →
        </Link>
      </p>

      {/* Mode tabs */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => { setMode("individual"); setEditing(null); setView("cards") }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "individual"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          👤 Individual / Family
        </button>
        <button
          onClick={() => { setMode("company"); setEditing(null); setView("cards") }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "company"
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          🏢 Company / Group Plans
        </button>

        <div className="ml-auto flex items-center gap-2">
          {(["cards", "compare", "cost"] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                view === v ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {v === "cards" ? "📋 Plans" : v === "compare" ? "⚖️ Compare" : "💰 Cost Estimator"}
            </button>
          ))}
        </div>
      </div>

      {/* ── CARDS VIEW ── */}
      {view === "cards" && !editing && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activePlans.map(p => (
              <PlanCard
                key={p.id}
                plan={p}
                isCompany={mode === "company"}
                onEdit={() => setEditing(p)}
                onDelete={() => deletePlan(p.id)}
              />
            ))}
            {/* Add plan card */}
            <button
              onClick={addPlan}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:border-blue-400 hover:bg-blue-50/50 transition-all group min-h-[200px]"
            >
              <span className="text-4xl group-hover:scale-110 transition-transform">＋</span>
              <span className="text-sm font-medium text-gray-500 group-hover:text-blue-600">
                Add a Plan
              </span>
            </button>
          </div>
          {activePlans.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              No plans added yet. Click "Add a Plan" to get started.
            </div>
          )}
        </div>
      )}

      {/* ── EDIT FORM ── */}
      {editing && (
        <PlanForm
          plan={editing}
          isCompany={mode === "company"}
          onSave={savePlan}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* ── COMPARE VIEW ── */}
      {view === "compare" && !editing && (
        <CompareTable plans={activePlans} isCompany={mode === "company"} />
      )}

      {/* ── COST ESTIMATOR VIEW ── */}
      {view === "cost" && !editing && (
        <div>
          {/* Usage selector */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">How much care do you expect to use?</h3>
            <div className="flex flex-wrap gap-2">
              {USAGE_PROFILES.map((u, i) => (
                <button
                  key={u.label}
                  onClick={() => setUsageIdx(i)}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                    usageIdx === i
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {u.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {USAGE_PROFILES[usageIdx].pcpVisits} PCP visits ·{" "}
              {USAGE_PROFILES[usageIdx].specialistVisits} specialist ·{" "}
              {USAGE_PROFILES[usageIdx].erVisits} ER ·{" "}
              {USAGE_PROFILES[usageIdx].rxGenericFills} Rx generic ·{" "}
              {USAGE_PROFILES[usageIdx].rxPreferredFills} Rx brand{" "}
              {USAGE_PROFILES[usageIdx].majorEvent && "· 🏥 Major event ($50K)"}
            </p>
          </div>

          {activePlans.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              Add some plans first, then come here to see which costs less.
            </div>
          ) : (
            <div className="space-y-3">
              {costEstimates.map(({ plan, annualCost }, i) => {
                const savings = annualCost - cheapest
                const isLowest = i === 0
                return (
                  <div
                    key={plan.id}
                    className={`border rounded-xl p-5 flex items-center gap-6 transition-all ${
                      isLowest ? "border-green-400 bg-green-50/50 ring-1 ring-green-200" : ""
                    }`}
                  >
                    <div className="text-center w-10">
                      {isLowest ? (
                        <span className="text-2xl">🏆</span>
                      ) : (
                        <span className="text-lg text-gray-400 font-bold">#{i + 1}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{plan.name}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METAL_COLORS[plan.metalTier]}`}>
                          {METAL_LABELS[plan.metalTier]}
                        </span>
                        <span className="text-[10px] text-gray-500">{plan.carrier}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        ${plan.monthlyPremium.toLocaleString()}/mo premium ·{" "}
                        ${plan.annualDeductible.toLocaleString()} deductible ·{" "}
                        ${plan.oopMax.toLocaleString()} OOP max
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-xl font-bold ${isLowest ? "text-green-700" : "text-gray-800"}`}>
                        ${annualCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[10px] text-gray-500">est. annual cost</div>
                      {!isLowest && (
                        <div className="text-xs text-red-500 mt-0.5">
                          +${savings.toLocaleString(undefined, { maximumFractionDigits: 0 })} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Explanation */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-5">
            <h4 className="text-sm font-semibold text-blue-800 mb-2">How we estimate costs</h4>
            <p className="text-xs text-blue-700 leading-relaxed">
              <strong>Annual cost = (monthly premium × 12) + estimated out-of-pocket.</strong>{" "}
              Out-of-pocket includes copays for visits and prescriptions, plus deductible and
              coinsurance for major events. The total out-of-pocket is capped at the plan's
              out-of-pocket maximum. For company plans, we use the employee's share of the premium
              (after employer contribution). This is a simplified estimate — actual costs depend
              on in-network vs. out-of-network, prior authorizations, and benefit specifics.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Plan Card ──

function PlanCard({
  plan,
  isCompany,
  onEdit,
  onDelete,
}: {
  plan: Plan
  isCompany: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const premium = isCompany && plan.employeeCost != null ? plan.employeeCost : plan.monthlyPremium

  return (
    <div className="border rounded-xl p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{plan.name || "Unnamed Plan"}</h3>
          <p className="text-xs text-gray-500">{plan.carrier || "—"}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METAL_COLORS[plan.metalTier]}`}>
            {METAL_LABELS[plan.metalTier]}
          </span>
          <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
            {NET_LABELS[plan.networkType]}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
        <div>
          <span className="text-gray-400">Monthly Premium</span>
          <div className="font-semibold text-gray-800">${premium.toLocaleString()}/mo</div>
          {isCompany && plan.employerContribution != null && plan.employerContribution > 0 && (
            <div className="text-[10px] text-green-600">
              Employer pays ${plan.employerContribution.toLocaleString()}/mo
            </div>
          )}
        </div>
        <div>
          <span className="text-gray-400">Deductible</span>
          <div className="font-semibold text-gray-800">${plan.annualDeductible.toLocaleString()}</div>
          {plan.familyDeductible != null && (
            <div className="text-[10px] text-gray-400">${plan.familyDeductible.toLocaleString()} family</div>
          )}
        </div>
        <div>
          <span className="text-gray-400">OOP Max</span>
          <div className="font-semibold text-gray-800">${plan.oopMax.toLocaleString()}</div>
        </div>
        <div>
          <span className="text-gray-400">Coinsurance</span>
          <div className="font-semibold text-gray-800">{plan.coinsurance}% (you pay)</div>
        </div>
        <div>
          <span className="text-gray-400">PCP Visit</span>
          <div className="font-semibold text-gray-800">${plan.copayPrimary}</div>
        </div>
        <div>
          <span className="text-gray-400">Specialist</span>
          <div className="font-semibold text-gray-800">${plan.copaySpecialist}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {plan.hsaEligible && (
          <span className="text-[10px] font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">HSA</span>
        )}
        {plan.telehealth != null && (
          <span className="text-[10px] font-medium bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
            Telehealth ${plan.telehealth}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-4 pt-3 border-t">
        <button
          onClick={onEdit}
          className="text-xs text-blue-600 hover:underline font-medium"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="text-xs text-red-500 hover:underline"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

// ── Plan Form ──

function PlanForm({
  plan,
  isCompany,
  onSave,
  onCancel,
}: {
  plan: Plan
  isCompany: boolean
  onSave: (p: Plan) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<Plan>(plan)

  function set<K extends keyof Plan>(key: K, val: Plan[K]) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  function num(key: keyof Plan, e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value === "" ? 0 : parseFloat(e.target.value)
    set(key, isNaN(v) ? 0 : v as never)
  }

  function numOrNull(key: keyof Plan, e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value === "" ? null : parseFloat(e.target.value)
    set(key, (v != null && isNaN(v) ? null : v) as never)
  }

  return (
    <div className="border rounded-xl p-6 bg-white max-w-3xl">
      <h2 className="text-lg font-semibold mb-4">
        {plan.name ? `Edit: ${plan.name}` : "Add New Plan"}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Field label="Plan Name" required>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={form.name}
            onChange={e => set("name", e.target.value)}
            placeholder='e.g. "Blue Cross Silver PPO"'
          />
        </Field>
        <Field label="Insurance Carrier">
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={form.carrier}
            onChange={e => set("carrier", e.target.value)}
            placeholder="e.g. Blue Cross Blue Shield"
          />
        </Field>
        <Field label="Metal Tier">
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={form.metalTier}
            onChange={e => set("metalTier", e.target.value as MetalTier)}
          >
            {(Object.keys(METAL_LABELS) as MetalTier[]).map(t => (
              <option key={t} value={t}>{METAL_LABELS[t]}</option>
            ))}
          </select>
        </Field>
        <Field label="Network Type">
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={form.networkType}
            onChange={e => set("networkType", e.target.value as NetworkType)}
          >
            {(Object.keys(NET_LABELS) as NetworkType[]).map(t => (
              <option key={t} value={t}>{NET_LABELS[t]}</option>
            ))}
          </select>
        </Field>
      </div>

      <h3 className="text-sm font-semibold text-gray-600 mt-4 mb-2 border-t pt-4">💲 Premiums & Cost Sharing</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <Field label="Monthly Premium ($)">
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.monthlyPremium || ""} onChange={e => num("monthlyPremium", e)} />
        </Field>
        <Field label="Annual Deductible ($)">
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.annualDeductible || ""} onChange={e => num("annualDeductible", e)} />
        </Field>
        <Field label="Family Deductible ($)">
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.familyDeductible ?? ""} onChange={e => numOrNull("familyDeductible", e)} placeholder="Optional" />
        </Field>
        <Field label="OOP Maximum ($)">
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.oopMax || ""} onChange={e => num("oopMax", e)} />
        </Field>
        <Field label="Family OOP Max ($)">
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.familyOopMax ?? ""} onChange={e => numOrNull("familyOopMax", e)} placeholder="Optional" />
        </Field>
        <Field label="Coinsurance (you pay %)">
          <input type="number" min={0} max={100} className="w-full border rounded px-3 py-2 text-sm" value={form.coinsurance} onChange={e => num("coinsurance", e)} />
        </Field>
      </div>

      <h3 className="text-sm font-semibold text-gray-600 mt-4 mb-2 border-t pt-4">🩺 Copays</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Field label="PCP Visit ($)">
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.copayPrimary || ""} onChange={e => num("copayPrimary", e)} />
        </Field>
        <Field label="Specialist ($)">
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.copaySpecialist || ""} onChange={e => num("copaySpecialist", e)} />
        </Field>
        <Field label="Urgent Care ($)">
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.copayUrgentCare || ""} onChange={e => num("copayUrgentCare", e)} />
        </Field>
        <Field label="ER ($)">
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.copayER || ""} onChange={e => num("copayER", e)} />
        </Field>
      </div>

      <h3 className="text-sm font-semibold text-gray-600 mt-4 mb-2 border-t pt-4">💊 Prescriptions</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <Field label="Generic Rx ($)">
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.rxGeneric || ""} onChange={e => num("rxGeneric", e)} />
        </Field>
        <Field label="Preferred Brand Rx ($)">
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.rxPreferred || ""} onChange={e => num("rxPreferred", e)} />
        </Field>
        <Field label="Specialty Rx ($)">
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.rxSpecialty ?? ""} onChange={e => numOrNull("rxSpecialty", e)} placeholder="Optional" />
        </Field>
      </div>

      <h3 className="text-sm font-semibold text-gray-600 mt-4 mb-2 border-t pt-4">✨ Additional Benefits</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <Field label="Telehealth ($)">
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.telehealth ?? ""} onChange={e => numOrNull("telehealth", e)} placeholder="Copay" />
        </Field>
        <Field label="Mental Health ($)">
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.mentalHealth ?? ""} onChange={e => numOrNull("mentalHealth", e)} placeholder="Copay" />
        </Field>
        <Field label="HSA Eligible">
          <label className="flex items-center gap-2 mt-2">
            <input type="checkbox" checked={form.hsaEligible} onChange={e => set("hsaEligible", e.target.checked)} />
            <span className="text-sm">Yes, HSA eligible</span>
          </label>
        </Field>
      </div>

      {isCompany && (
        <>
          <h3 className="text-sm font-semibold text-gray-600 mt-4 mb-2 border-t pt-4">🏢 Employer Contribution</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Field label="Employer Contribution ($/mo)">
              <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.employerContribution ?? ""} onChange={e => numOrNull("employerContribution", e)} placeholder="How much employer pays" />
            </Field>
            <Field label="Your Cost After Employer ($/mo)">
              <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.employeeCost ?? ""} onChange={e => numOrNull("employeeCost", e)} placeholder="What you actually pay" />
            </Field>
          </div>
        </>
      )}

      <Field label="Notes">
        <textarea
          className="w-full border rounded px-3 py-2 text-sm"
          rows={2}
          value={form.notes}
          onChange={e => set("notes", e.target.value)}
          placeholder="Any additional notes about this plan…"
        />
      </Field>

      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={() => onSave(form)}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          Save Plan
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Field wrapper ──

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  )
}

// ── Compare Table ──

function CompareTable({ plans, isCompany }: { plans: Plan[]; isCompany: boolean }) {

  if (plans.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        Add at least two plans to compare them side-by-side.
      </div>
    )
  }

  type Row = { label: string; values: (string | React.ReactNode)[]; rawValues?: string[] }
  const rows: Row[] = [
    {
      label: "Metal Tier",
      values: plans.map(p => (
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${METAL_COLORS[p.metalTier]}`}>
          {METAL_LABELS[p.metalTier]}
        </span>
      )),
      rawValues: plans.map(p => METAL_LABELS[p.metalTier]),
    },
    { label: "Network", values: plans.map(p => NET_LABELS[p.networkType]), rawValues: plans.map(p => NET_LABELS[p.networkType]) },
    { label: "Monthly Premium", values: plans.map(p => {
      const amt = isCompany && p.employeeCost != null ? p.employeeCost : p.monthlyPremium
      return `$${amt.toLocaleString()}`
    }), rawValues: plans.map(p => String(isCompany && p.employeeCost != null ? p.employeeCost : p.monthlyPremium))},
    { label: "Annual Premium", values: plans.map(p => {
      const amt = isCompany && p.employeeCost != null ? p.employeeCost : p.monthlyPremium
      return `$${(amt * 12).toLocaleString()}`
    }), rawValues: plans.map(p => String((isCompany && p.employeeCost != null ? p.employeeCost : p.monthlyPremium) * 12))},
    { label: "Deductible", values: plans.map(p => `$${p.annualDeductible.toLocaleString()}`), rawValues: plans.map(p => String(p.annualDeductible)) },
    { label: "Family Deductible", values: plans.map(p => p.familyDeductible != null ? `$${p.familyDeductible.toLocaleString()}` : "—"), rawValues: plans.map(p => p.familyDeductible != null ? String(p.familyDeductible) : "") },
    { label: "OOP Maximum", values: plans.map(p => `$${p.oopMax.toLocaleString()}`), rawValues: plans.map(p => String(p.oopMax)) },
    { label: "Family OOP Max", values: plans.map(p => p.familyOopMax != null ? `$${p.familyOopMax.toLocaleString()}` : "—"), rawValues: plans.map(p => p.familyOopMax != null ? String(p.familyOopMax) : "") },
    { label: "Coinsurance", values: plans.map(p => `${p.coinsurance}%`), rawValues: plans.map(p => `${p.coinsurance}%`) },
    { label: "PCP Copay", values: plans.map(p => `$${p.copayPrimary}`), rawValues: plans.map(p => String(p.copayPrimary)) },
    { label: "Specialist Copay", values: plans.map(p => `$${p.copaySpecialist}`), rawValues: plans.map(p => String(p.copaySpecialist)) },
    { label: "Urgent Care", values: plans.map(p => `$${p.copayUrgentCare}`), rawValues: plans.map(p => String(p.copayUrgentCare)) },
    { label: "ER Copay", values: plans.map(p => `$${p.copayER}`), rawValues: plans.map(p => String(p.copayER)) },
    { label: "Generic Rx", values: plans.map(p => `$${p.rxGeneric}`), rawValues: plans.map(p => String(p.rxGeneric)) },
    { label: "Preferred Rx", values: plans.map(p => `$${p.rxPreferred}`), rawValues: plans.map(p => String(p.rxPreferred)) },
    { label: "Specialty Rx", values: plans.map(p => p.rxSpecialty != null ? `$${p.rxSpecialty}` : "—"), rawValues: plans.map(p => p.rxSpecialty != null ? String(p.rxSpecialty) : "") },
    { label: "Telehealth", values: plans.map(p => p.telehealth != null ? `$${p.telehealth}` : "—"), rawValues: plans.map(p => p.telehealth != null ? String(p.telehealth) : "") },
    { label: "Mental Health", values: plans.map(p => p.mentalHealth != null ? `$${p.mentalHealth}` : "—"), rawValues: plans.map(p => p.mentalHealth != null ? String(p.mentalHealth) : "") },
    {
      label: "HSA Eligible",
      values: plans.map(p => p.hsaEligible ? (
        <span className="text-green-600 font-semibold">✓ Yes</span>
      ) : (
        <span className="text-gray-400">No</span>
      )),
      rawValues: plans.map(p => p.hsaEligible ? "Yes" : "No"),
    },
  ]

  if (isCompany) {
    rows.splice(3, 0, {
      label: "Employer Contribution",
      values: plans.map(p => p.employerContribution != null ? `$${p.employerContribution.toLocaleString()}/mo` : "—"),
    })
  }

  // Find best (lowest) value for certain numeric rows
  const bestIdx = (extractor: (p: Plan) => number) => {
    let minVal = Infinity, minI = -1
    plans.forEach((p, i) => {
      const v = extractor(p)
      if (v < minVal) { minVal = v; minI = i }
    })
    return minI
  }

  const premiumBest = bestIdx(p => isCompany && p.employeeCost != null ? p.employeeCost : p.monthlyPremium)
  const dedBest = bestIdx(p => p.annualDeductible)
  const oopBest = bestIdx(p => p.oopMax)

  // ── Export helpers ──

  function buildCsvString(): string {
    const header = ["Benefit", ...plans.map(p => p.name || "Unnamed")].map(esc).join(",")
    const dataRows = rows.map(r => {
      const raw = r.rawValues ?? r.values.map(v => typeof v === "string" ? v : "")
      return [r.label, ...raw].map(esc).join(",")
    })
    return [header, ...dataRows].join("\n")
  }

  function esc(v: string): string {
    if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`
    return v
  }

  function downloadFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function exportCsv() {
    const csv = "\uFEFF" + buildCsvString() // BOM for Excel/Numbers UTF-8 compat
    downloadFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), "plan_comparison.csv")
  }

  function exportXlsx() {
    // Build a simple XLSX using the SpreadsheetML XML format (no library needed)
    const header = ["Benefit", ...plans.map(p => p.name || "Unnamed")]
    const dataRows = rows.map(r => {
      const raw = r.rawValues ?? r.values.map(v => typeof v === "string" ? v : "")
      return [r.label, ...raw]
    })
    const allRows = [header, ...dataRows]

    // Build worksheet XML
    const xmlRows = allRows.map(row => {
      const cells = row.map(cell => {
        const num = Number(cell)
        if (cell !== "" && !isNaN(num) && !String(cell).includes("%")) {
          return `<c t="n"><v>${num}</v></c>`
        }
        return `<c t="inlineStr"><is><t>${xmlEsc(String(cell))}</t></is></c>`
      }).join("")
      return `<row>${cells}</row>`
    }).join("")

    const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${xmlRows}</sheetData></worksheet>`

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Plan Comparison" sheetId="1" r:id="rId1"/></sheets></workbook>`

    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`

    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

    // Build ZIP manually using Blob parts
    // We'll use the simpler approach: just download as CSV with .xlsx for basic compat
    // For proper XLSX, use the JSZip-less approach with the open XML format
    // Actually, let's use a minimal ZIP builder:
    buildAndDownloadXlsx({
      "[Content_Types].xml": contentTypes,
      "_rels/.rels": rootRels,
      "xl/workbook.xml": workbook,
      "xl/_rels/workbook.xml.rels": workbookRels,
      "xl/worksheets/sheet1.xml": worksheet,
    }, "plan_comparison.xlsx")
  }

  function xmlEsc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  }

  async function buildAndDownloadXlsx(files: Record<string, string>, filename: string) {
    // Minimal ZIP builder using CompressionStream API
    // For broader compat, just fall back to CSV-based xlsx if needed

    // Simple approach: use the blob-based ZIP approach
    const parts: { name: string; data: Uint8Array }[] = []
    const enc = new TextEncoder()
    for (const [name, content] of Object.entries(files)) {
      parts.push({ name, data: enc.encode(content) })
    }

    // Build ZIP manually
    const zip = buildZip(parts)
    downloadFile(new Blob([zip.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename)
  }

  function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
    const enc = new TextEncoder()
    const entries: { offset: number; name: Uint8Array; data: Uint8Array; crc: number }[] = []
    const chunks: Uint8Array[] = []
    let offset = 0

    for (const file of files) {
      const nameBytes = enc.encode(file.name)
      const crc = crc32(file.data)
      entries.push({ offset, name: nameBytes, data: file.data, crc })

      // Local file header
      const header = new Uint8Array(30 + nameBytes.length)
      const hv = new DataView(header.buffer)
      hv.setUint32(0, 0x04034b50, true) // signature
      hv.setUint16(4, 20, true) // version
      hv.setUint16(6, 0, true) // flags
      hv.setUint16(8, 0, true) // compression (store)
      hv.setUint16(10, 0, true) // mod time
      hv.setUint16(12, 0, true) // mod date
      hv.setUint32(14, crc, true)
      hv.setUint32(18, file.data.length, true) // compressed
      hv.setUint32(22, file.data.length, true) // uncompressed
      hv.setUint16(26, nameBytes.length, true)
      hv.setUint16(28, 0, true) // extra length
      header.set(nameBytes, 30)
      chunks.push(header, file.data)
      offset += header.length + file.data.length
    }

    const centralStart = offset
    for (const e of entries) {
      const cd = new Uint8Array(46 + e.name.length)
      const dv = new DataView(cd.buffer)
      dv.setUint32(0, 0x02014b50, true) // central dir signature
      dv.setUint16(4, 20, true) // version made by
      dv.setUint16(6, 20, true) // version needed
      dv.setUint16(8, 0, true) // flags
      dv.setUint16(10, 0, true) // compression
      dv.setUint16(12, 0, true) // mod time
      dv.setUint16(14, 0, true) // mod date
      dv.setUint32(16, e.crc, true)
      dv.setUint32(20, e.data.length, true) // compressed
      dv.setUint32(24, e.data.length, true) // uncompressed
      dv.setUint16(28, e.name.length, true)
      dv.setUint16(30, 0, true) // extra
      dv.setUint16(32, 0, true) // comment
      dv.setUint16(34, 0, true) // disk
      dv.setUint16(36, 0, true) // internal attrs
      dv.setUint32(38, 0, true) // external attrs
      dv.setUint32(42, e.offset, true) // local header offset
      cd.set(e.name, 46)
      chunks.push(cd)
      offset += cd.length
    }

    const centralSize = offset - centralStart
    // End of central directory
    const eocd = new Uint8Array(22)
    const ev = new DataView(eocd.buffer)
    ev.setUint32(0, 0x06054b50, true)
    ev.setUint16(4, 0, true) // disk
    ev.setUint16(6, 0, true) // disk with cd
    ev.setUint16(8, entries.length, true)
    ev.setUint16(10, entries.length, true)
    ev.setUint32(12, centralSize, true)
    ev.setUint32(16, centralStart, true)
    ev.setUint16(20, 0, true) // comment
    chunks.push(eocd)

    const total = chunks.reduce((s, c) => s + c.length, 0)
    const result = new Uint8Array(total)
    let pos = 0
    for (const c of chunks) { result.set(c, pos); pos += c.length }
    return result
  }

  function crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i]
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
    }
    return (crc ^ 0xFFFFFFFF) >>> 0
  }

  return (
    <div>
      {/* Export buttons */}
      <div className="flex items-center justify-end gap-2 mb-3">
        <span className="text-xs text-gray-400 mr-1">Export:</span>
        <button
          onClick={exportCsv}
          className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
          title="CSV — opens in Google Sheets, Excel, and Numbers"
        >
          📊 CSV / Google Sheets
        </button>
        <button
          onClick={exportXlsx}
          className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
          title="XLSX — native Excel and Numbers format"
        >
          📗 XLSX / Numbers
        </button>
      </div>

      <div className="border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500 w-40">Benefit</th>
              {plans.map(p => (
                <th key={p.id} className="text-center px-4 py-3 font-semibold text-gray-800 min-w-[160px]">
                  {p.name || "Unnamed"}
                  <div className="text-[10px] text-gray-400 font-normal">{p.carrier}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.label} className={ri % 2 ? "bg-gray-50/50" : ""}>
                <td className="px-4 py-2 text-xs text-gray-500 font-medium">{row.label}</td>
                {row.values.map((v, ci) => {
                  // Highlight best for key rows
                  let highlight = false
                  if (row.label === "Monthly Premium" && ci === premiumBest) highlight = true
                  if (row.label === "Deductible" && ci === dedBest) highlight = true
                  if (row.label === "OOP Maximum" && ci === oopBest) highlight = true

                  return (
                    <td
                      key={ci}
                      className={`px-4 py-2 text-center text-xs ${
                        highlight ? "text-green-700 font-bold bg-green-50" : ""
                      }`}
                    >
                      {v}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  )
}
