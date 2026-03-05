/**
 * MyPlans — /insurance-plans
 *
 * Single-page CRUD for the user's saved insurance plans
 * with a tab-based layout: "My Plans" (list + add) and "Compare" (side-by-side).
 */

import { useState, useEffect, useCallback } from "react"
import { Link } from "react-router-dom"
import * as XLSX from "xlsx"
import { insurancePlansApi } from "@/lib/api"
import type { InsurancePlanResponse, InsurancePlanPayload } from "@/lib/api"
import { useAuth } from "@/store/auth"

// ── Helpers ──

const METAL_COLORS: Record<string, string> = {
  bronze:      "bg-amber-100 text-amber-800",
  silver:      "bg-gray-200 text-gray-700",
  gold:        "bg-yellow-100 text-yellow-800",
  platinum:    "bg-indigo-100 text-indigo-800",
  catastrophic:"bg-red-100 text-red-700",
}

const PLAN_TYPE_LABELS: Record<string, string> = {
  hmo: "HMO", ppo: "PPO", epo: "EPO", pos: "POS", hdhp: "HDHP",
}

function dollar(v?: number | null) {
  if (v == null) return "—"
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function pct(v?: number | null) {
  if (v == null) return "—"
  return `${v}%`
}

// ── Life events for cost simulation ──

interface LifeEvent {
  id: string
  label: string
  emoji: string
  description: string
  /** Estimated total billed cost for the year from this event */
  estimatedCost: number
  /** How many PCP visits this event adds */
  pcpVisits: number
  /** How many specialist visits this event adds */
  specialistVisits: number
  /** How many ER visits this event adds */
  erVisits: number
  /** How many urgent care visits this event adds */
  urgentCareVisits: number
  /** Monthly generic Rx cost (number of refills × copay) */
  genericRxRefills: number
  /** Monthly preferred Rx cost */
  preferredRxRefills: number
  /** Number of therapy / mental health visits */
  mentalHealthVisits: number
}

const LIFE_EVENTS: LifeEvent[] = [
  {
    id: "healthy",
    label: "Generally healthy",
    emoji: "😊",
    description: "Annual physical + flu shot, maybe 1–2 sick visits",
    estimatedCost: 500,
    pcpVisits: 3,
    specialistVisits: 0,
    erVisits: 0,
    urgentCareVisits: 0,
    genericRxRefills: 0,
    preferredRxRefills: 0,
    mentalHealthVisits: 0,
  },
  {
    id: "chronic-meds",
    label: "Monthly medications",
    emoji: "💊",
    description: "1 ongoing generic Rx (12 refills/year) + quarterly doctor visits",
    estimatedCost: 2_400,
    pcpVisits: 4,
    specialistVisits: 0,
    erVisits: 0,
    urgentCareVisits: 0,
    genericRxRefills: 12,
    preferredRxRefills: 0,
    mentalHealthVisits: 0,
  },
  {
    id: "brand-meds",
    label: "Brand-name medications",
    emoji: "💉",
    description: "1 preferred brand Rx (12 refills/year) + quarterly specialist visits",
    estimatedCost: 6_000,
    pcpVisits: 2,
    specialistVisits: 4,
    erVisits: 0,
    urgentCareVisits: 0,
    genericRxRefills: 0,
    preferredRxRefills: 12,
    mentalHealthVisits: 0,
  },
  {
    id: "specialist",
    label: "Specialist care",
    emoji: "🩺",
    description: "6 specialist visits + labs/imaging",
    estimatedCost: 5_000,
    pcpVisits: 2,
    specialistVisits: 6,
    erVisits: 0,
    urgentCareVisits: 0,
    genericRxRefills: 0,
    preferredRxRefills: 0,
    mentalHealthVisits: 0,
  },
  {
    id: "therapy",
    label: "Weekly therapy",
    emoji: "🧠",
    description: "48 sessions/year (weekly minus holidays)",
    estimatedCost: 7_200,
    pcpVisits: 1,
    specialistVisits: 0,
    erVisits: 0,
    urgentCareVisits: 0,
    genericRxRefills: 0,
    preferredRxRefills: 0,
    mentalHealthVisits: 48,
  },
  {
    id: "er-visit",
    label: "ER visit",
    emoji: "🚑",
    description: "One emergency room visit (avg. cost ~$2,500)",
    estimatedCost: 2_500,
    pcpVisits: 1,
    specialistVisits: 0,
    erVisits: 1,
    urgentCareVisits: 0,
    genericRxRefills: 0,
    preferredRxRefills: 0,
    mentalHealthVisits: 0,
  },
  {
    id: "urgent-care",
    label: "Urgent care visits",
    emoji: "🏥",
    description: "3 urgent care trips (sprains, infections, etc.)",
    estimatedCost: 1_200,
    pcpVisits: 0,
    specialistVisits: 0,
    erVisits: 0,
    urgentCareVisits: 3,
    genericRxRefills: 0,
    preferredRxRefills: 0,
    mentalHealthVisits: 0,
  },
  {
    id: "baby",
    label: "Having a baby",
    emoji: "👶",
    description: "Prenatal care + delivery (~$15,000 billed for vaginal, ~$22,000 C-section)",
    estimatedCost: 18_000,
    pcpVisits: 2,
    specialistVisits: 12,
    erVisits: 0,
    urgentCareVisits: 0,
    genericRxRefills: 0,
    preferredRxRefills: 0,
    mentalHealthVisits: 0,
  },
  {
    id: "surgery",
    label: "Planned surgery",
    emoji: "🔪",
    description: "Outpatient surgery + follow-ups (~$25,000 billed)",
    estimatedCost: 25_000,
    pcpVisits: 2,
    specialistVisits: 4,
    erVisits: 0,
    urgentCareVisits: 0,
    genericRxRefills: 0,
    preferredRxRefills: 0,
    mentalHealthVisits: 0,
  },
  {
    id: "major-illness",
    label: "Major illness / hospitalization",
    emoji: "🏨",
    description: "Extended hospital stay + treatment (~$60,000+ billed)",
    estimatedCost: 60_000,
    pcpVisits: 4,
    specialistVisits: 10,
    erVisits: 1,
    urgentCareVisits: 0,
    genericRxRefills: 6,
    preferredRxRefills: 6,
    mentalHealthVisits: 0,
  },
]

/**
 * Estimate annual out-of-pocket cost for a plan given selected life events.
 *
 * Logic:
 * 1. Start with annual premiums
 * 2. Sum all copay-based costs (PCP, specialist, ER, urgent care, Rx, mental health)
 * 3. Remaining billed costs go through deductible → coinsurance
 * 4. Total OOP (excluding premiums) is capped at OOP max
 * 5. Return premiums + capped OOP
 */
function estimateAnnualCost(plan: InsurancePlanResponse, selectedEvents: string[]): {
  premiums: number
  copays: number
  deductibleSpend: number
  coinsuranceSpend: number
  totalOop: number
  totalWithPremiums: number
  hitOopMax: boolean
} {
  const events = LIFE_EVENTS.filter((e) => selectedEvents.includes(e.id))
  const premiums = (plan.monthly_premium ?? 0) * 12

  // Sum copay-based costs
  let copays = 0
  let totalBilledCost = 0
  for (const ev of events) {
    copays += ev.pcpVisits * (plan.copay_primary ?? 0)
    copays += ev.specialistVisits * (plan.copay_specialist ?? 0)
    copays += ev.erVisits * (plan.copay_er ?? 0)
    copays += ev.urgentCareVisits * (plan.copay_urgent_care ?? 0)
    copays += ev.genericRxRefills * (plan.rx_generic ?? 0)
    copays += ev.preferredRxRefills * (plan.rx_preferred ?? 0)
    copays += ev.mentalHealthVisits * (plan.mental_health_copay ?? plan.copay_specialist ?? 0)
    totalBilledCost += ev.estimatedCost
  }

  // The "big bill" portion goes through deductible + coinsurance
  // (subtract copay-eligible portions — rough estimate: copay visits are already paid via copay)
  const bigBillPortion = Math.max(0, totalBilledCost - copays)
  const deductible = plan.annual_deductible ?? 0
  const coinsuranceRate = (plan.coinsurance ?? 20) / 100
  const oopMax = plan.oop_max ?? 9200

  // Deductible portion
  const deductibleSpend = Math.min(bigBillPortion, deductible)
  const afterDeductible = Math.max(0, bigBillPortion - deductible)

  // Coinsurance portion (your share)
  const coinsuranceSpend = afterDeductible * coinsuranceRate

  // Total OOP before cap (excludes premiums)
  const rawOop = copays + deductibleSpend + coinsuranceSpend
  const hitOopMax = rawOop > oopMax
  const totalOop = Math.min(rawOop, oopMax)

  return {
    premiums,
    copays,
    deductibleSpend,
    coinsuranceSpend: hitOopMax ? Math.max(0, oopMax - copays - deductibleSpend) : coinsuranceSpend,
    totalOop,
    totalWithPremiums: premiums + totalOop,
    hitOopMax,
  }
}

const BLANK_PLAN: InsurancePlanPayload = {
  name: "",
  carrier: "",
  plan_type: "ppo",
  metal_tier: "silver",
  member_id: "",
  group_number: "",
  monthly_premium: 0,
  annual_deductible: 0,
  family_deductible: null,
  oop_max: 0,
  family_oop_max: null,
  copay_primary: 0,
  copay_specialist: 0,
  copay_urgent_care: 0,
  copay_er: 0,
  coinsurance: 20,
  rx_generic: 0,
  rx_preferred: 0,
  rx_specialty: null,
  hsa_eligible: false,
  telehealth_copay: null,
  mental_health_copay: null,
  employer_contribution: null,
  employee_cost: null,
  notes: "",
}

// ── Component ──

export default function MyPlans() {
  const { user, guestRole, loading: authLoading } = useAuth()

  const [tab, setTab] = useState<"plans" | "compare">("plans")

  const [plans, setPlans] = useState<InsurancePlanResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<InsurancePlanPayload>({ ...BLANK_PLAN })
  const [saving, setSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["healthy"])

  // ── Auth gate ──
  if (!authLoading && !user && !guestRole) {
    return (
      <div className="max-w-md mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Insurance Plans</h1>
        <p className="text-gray-500 text-sm mb-6">
          Sign in or continue as a guest to save and compare insurance plans.
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/login" className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700">
            Sign In
          </Link>
          <Link to="/guest" className="border border-gray-300 px-5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50">
            Guest Mode
          </Link>
        </div>
      </div>
    )
  }

  // ── Fetch plans ──
  const fetchPlans = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await insurancePlansApi.list()
      setPlans(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plans")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  // ── Form handlers ──
  function openNew() {
    setEditId(null)
    setForm({ ...BLANK_PLAN })
    setShowForm(true)
  }

  function openEdit(plan: InsurancePlanResponse) {
    setEditId(plan.id)
    setForm({
      name: plan.name,
      carrier: plan.carrier,
      plan_type: plan.plan_type,
      metal_tier: plan.metal_tier,
      member_id: plan.member_id,
      group_number: plan.group_number,
      monthly_premium: plan.monthly_premium ?? 0,
      annual_deductible: plan.annual_deductible ?? 0,
      family_deductible: plan.family_deductible,
      oop_max: plan.oop_max ?? 0,
      family_oop_max: plan.family_oop_max,
      copay_primary: plan.copay_primary ?? 0,
      copay_specialist: plan.copay_specialist ?? 0,
      copay_urgent_care: plan.copay_urgent_care ?? 0,
      copay_er: plan.copay_er ?? 0,
      coinsurance: plan.coinsurance ?? 20,
      rx_generic: plan.rx_generic ?? 0,
      rx_preferred: plan.rx_preferred ?? 0,
      rx_specialty: plan.rx_specialty,
      hsa_eligible: plan.hsa_eligible ?? false,
      telehealth_copay: plan.telehealth_copay,
      mental_health_copay: plan.mental_health_copay,
      employer_contribution: plan.employer_contribution,
      employee_cost: plan.employee_cost,
      notes: plan.notes,
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      if (editId) {
        await insurancePlansApi.update(editId, form)
      } else {
        await insurancePlansApi.create(form)
      }
      setShowForm(false)
      setEditId(null)
      fetchPlans()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteConfirmId) return
    const id = deleteConfirmId
    setDeleteConfirmId(null)
    try {
      await insurancePlansApi.delete(id)
      fetchPlans()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed")
    }
  }

  function renderDeleteModal() {
    if (!deleteConfirmId) return null
    const plan = plans.find((p) => p.id === deleteConfirmId)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirmId(null)} />
        <div className="relative bg-white rounded-xl shadow-lg p-6 max-w-sm w-full mx-4">
          <h3 className="text-lg font-semibold mb-2">Delete plan?</h3>
          <p className="text-sm text-gray-600 mb-6">
            {plan ? `"${plan.name}" will be permanently deleted.` : "This plan will be permanently deleted."} This cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeleteConfirmId(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )
  }

  function setField(field: string, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // ── Compare view ──
  function exportCSV() {
    if (plans.length === 0) return
    const rows: string[][] = []
    const headers = ["Benefit", ...plans.map((p) => p.name || "Unnamed")]
    rows.push(headers)

    const fields: Array<{ label: string; fn: (p: InsurancePlanResponse) => string }> = [
      { label: "Plan Type", fn: (p) => PLAN_TYPE_LABELS[p.plan_type ?? ""] ?? p.plan_type ?? "" },
      { label: "Metal Tier", fn: (p) => p.metal_tier ?? "" },
      { label: "Carrier", fn: (p) => p.carrier ?? "" },
      { label: "Monthly Premium", fn: (p) => String(p.monthly_premium ?? 0) },
      { label: "Annual Deductible", fn: (p) => String(p.annual_deductible ?? 0) },
      { label: "Family Deductible", fn: (p) => String(p.family_deductible ?? "") },
      { label: "Out-of-Pocket Max", fn: (p) => String(p.oop_max ?? 0) },
      { label: "Family OOP Max", fn: (p) => String(p.family_oop_max ?? "") },
      { label: "Coinsurance %", fn: (p) => String(p.coinsurance ?? "") },
      { label: "PCP Copay", fn: (p) => String(p.copay_primary ?? 0) },
      { label: "Specialist Copay", fn: (p) => String(p.copay_specialist ?? 0) },
      { label: "Urgent Care Copay", fn: (p) => String(p.copay_urgent_care ?? 0) },
      { label: "ER Copay", fn: (p) => String(p.copay_er ?? 0) },
      { label: "Rx Generic", fn: (p) => String(p.rx_generic ?? 0) },
      { label: "Rx Preferred", fn: (p) => String(p.rx_preferred ?? 0) },
      { label: "Rx Specialty", fn: (p) => String(p.rx_specialty ?? "") },
      { label: "HSA Eligible", fn: (p) => p.hsa_eligible ? "Yes" : "No" },
      { label: "Telehealth Copay", fn: (p) => String(p.telehealth_copay ?? "") },
      { label: "Mental Health Copay", fn: (p) => String(p.mental_health_copay ?? "") },
      { label: "Employer Contribution", fn: (p) => String(p.employer_contribution ?? "") },
      { label: "Employee Cost", fn: (p) => String(p.employee_cost ?? "") },
      { label: "Annual Cost (premiums)", fn: (p) => String((p.monthly_premium ?? 0) * 12) },
    ]
    for (const f of fields) {
      rows.push([f.label, ...plans.map((p) => f.fn(p))])
    }

    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `insurance-plans-comparison-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportXLSX() {
    if (plans.length === 0) return
    const rows: (string | number)[][] = []
    const headers = ["Benefit", ...plans.map((p) => p.name || "Unnamed")]
    rows.push(headers)

    const fields: Array<{ label: string; fn: (p: InsurancePlanResponse) => string | number }> = [
      { label: "Plan Type", fn: (p) => PLAN_TYPE_LABELS[p.plan_type ?? ""] ?? p.plan_type ?? "" },
      { label: "Metal Tier", fn: (p) => p.metal_tier ?? "" },
      { label: "Carrier", fn: (p) => p.carrier ?? "" },
      { label: "Monthly Premium", fn: (p) => p.monthly_premium ?? 0 },
      { label: "Annual Deductible", fn: (p) => p.annual_deductible ?? 0 },
      { label: "Family Deductible", fn: (p) => p.family_deductible ?? "" },
      { label: "Out-of-Pocket Max", fn: (p) => p.oop_max ?? 0 },
      { label: "Family OOP Max", fn: (p) => p.family_oop_max ?? "" },
      { label: "Coinsurance %", fn: (p) => p.coinsurance ?? "" },
      { label: "PCP Copay", fn: (p) => p.copay_primary ?? 0 },
      { label: "Specialist Copay", fn: (p) => p.copay_specialist ?? 0 },
      { label: "Urgent Care Copay", fn: (p) => p.copay_urgent_care ?? 0 },
      { label: "ER Copay", fn: (p) => p.copay_er ?? 0 },
      { label: "Rx Generic", fn: (p) => p.rx_generic ?? 0 },
      { label: "Rx Preferred", fn: (p) => p.rx_preferred ?? 0 },
      { label: "Rx Specialty", fn: (p) => p.rx_specialty ?? "" },
      { label: "HSA Eligible", fn: (p) => p.hsa_eligible ? "Yes" : "No" },
      { label: "Telehealth Copay", fn: (p) => p.telehealth_copay ?? "" },
      { label: "Mental Health Copay", fn: (p) => p.mental_health_copay ?? "" },
      { label: "Employer Contribution", fn: (p) => p.employer_contribution ?? "" },
      { label: "Employee Cost", fn: (p) => p.employee_cost ?? "" },
      { label: "Annual Cost (premiums)", fn: (p) => (p.monthly_premium ?? 0) * 12 },
    ]
    for (const f of fields) {
      rows.push([f.label, ...plans.map((p) => f.fn(p))])
    }

    const ws = XLSX.utils.aoa_to_sheet(rows)
    // Auto-size columns
    ws["!cols"] = rows[0].map((_, i) => ({
      wch: Math.max(...rows.map((r) => String(r[i] ?? "").length), 10) + 2,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Plan Comparison")
    XLSX.writeFile(wb, `insurance-plans-comparison-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function CompareView() {
    if (plans.length < 2) {
      return (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <p className="text-gray-500 mb-4">Add at least 2 plans to compare.</p>
          <button onClick={() => setTab("plans")} className="text-blue-600 text-sm font-semibold hover:underline">
            ← Back to My Plans
          </button>
        </div>
      )
    }

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 text-xs">
            <Link to="/insurance-guide" className="text-blue-600 hover:underline font-medium">
              📖 Understanding Your Insurance →
            </Link>
            <Link to="/plans/glossary" className="text-gray-400 hover:text-gray-600 hover:underline">
              Glossary
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="text-xs text-gray-500 hover:text-gray-700 border rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
            >
              ⬇ CSV / Google Sheets
            </button>
            <button
              onClick={exportXLSX}
              className="text-xs text-gray-500 hover:text-gray-700 border rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
            >
              ⬇ Numbers / XLSX
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4 font-medium text-gray-500 min-w-[160px]">Benefit</th>
              {plans.map((p) => (
                <th key={p.id} className="text-left py-2 px-3 font-semibold min-w-[150px]">
                  <div>{p.name}</div>
                  <div className="text-xs font-normal text-gray-400">{p.carrier || "—"}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {[
              { label: "Plan Type", glossary: "hmo-health-maintenance-organization", fn: (p: InsurancePlanResponse) => PLAN_TYPE_LABELS[p.plan_type ?? ""] ?? p.plan_type ?? "—" },
              { label: "Metal Tier", glossary: "metal-tiers-bronze-silver-gold-platinum", fn: (p: InsurancePlanResponse) => p.metal_tier ?? "—" },
              { label: "Monthly Premium", glossary: "premium", fn: (p: InsurancePlanResponse) => dollar(p.monthly_premium) },
              { label: "Annual Deductible", glossary: "deductible", fn: (p: InsurancePlanResponse) => dollar(p.annual_deductible) },
              { label: "Family Deductible", glossary: "deductible", fn: (p: InsurancePlanResponse) => dollar(p.family_deductible) },
              { label: "Out-of-Pocket Max", glossary: "out-of-pocket-maximum-oop-max", fn: (p: InsurancePlanResponse) => dollar(p.oop_max) },
              { label: "Family OOP Max", glossary: "out-of-pocket-maximum-oop-max", fn: (p: InsurancePlanResponse) => dollar(p.family_oop_max) },
              { label: "Coinsurance", glossary: "coinsurance", fn: (p: InsurancePlanResponse) => pct(p.coinsurance) },
              { label: "PCP Copay", glossary: "copay-copayment", fn: (p: InsurancePlanResponse) => dollar(p.copay_primary) },
              { label: "Specialist Copay", glossary: "copay-copayment", fn: (p: InsurancePlanResponse) => dollar(p.copay_specialist) },
              { label: "Urgent Care Copay", glossary: "copay-copayment", fn: (p: InsurancePlanResponse) => dollar(p.copay_urgent_care) },
              { label: "ER Copay", glossary: "copay-copayment", fn: (p: InsurancePlanResponse) => dollar(p.copay_er) },
              { label: "Rx Generic", glossary: "formulary", fn: (p: InsurancePlanResponse) => dollar(p.rx_generic) },
              { label: "Rx Preferred", glossary: "formulary", fn: (p: InsurancePlanResponse) => dollar(p.rx_preferred) },
              { label: "Rx Specialty", glossary: "formulary", fn: (p: InsurancePlanResponse) => dollar(p.rx_specialty) },
              { label: "HSA Eligible", glossary: "hsa-health-savings-account", fn: (p: InsurancePlanResponse) => p.hsa_eligible ? "✓ Yes" : "No" },
              { label: "Telehealth", glossary: "telehealth", fn: (p: InsurancePlanResponse) => dollar(p.telehealth_copay) },
              { label: "Mental Health", glossary: "mental-health-coverage", fn: (p: InsurancePlanResponse) => dollar(p.mental_health_copay) },
              { label: "Employer Contribution", glossary: "employer-contribution", fn: (p: InsurancePlanResponse) => dollar(p.employer_contribution) },
              { label: "Employee Cost", glossary: "employee-cost", fn: (p: InsurancePlanResponse) => dollar(p.employee_cost) },
              { label: "Annual Cost (premiums)", glossary: "premium", fn: (p: InsurancePlanResponse) => dollar((p.monthly_premium ?? 0) * 12) },
            ].map((row) => (
              <tr key={row.label} className="hover:bg-gray-50">
                <td className="py-2 pr-4 text-gray-500 font-medium">
                  {row.glossary ? (
                    <Link to={`/plans/glossary#${row.glossary}`} className="hover:text-blue-600 hover:underline" title={`What is ${row.label}?`}>
                      {row.label} <span className="text-gray-300 text-xs">↗</span>
                    </Link>
                  ) : row.label}
                </td>
                {plans.map((p) => (
                  <td key={p.id} className="py-2 px-3">{row.fn(p)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {/* ── Cost Simulation ── */}
        <div className="mt-8 border-t pt-6">
          <div className="mb-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              🧮 Cost Simulator
              <span className="text-xs font-normal text-gray-400">— estimate your annual cost</span>
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Select the life events and care needs that apply to you. We'll estimate what each plan would actually cost you this year.
            </p>
          </div>

          {/* Life event toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-6">
            {LIFE_EVENTS.map((ev) => {
              const active = selectedEvents.includes(ev.id)
              return (
                <button
                  key={ev.id}
                  onClick={() =>
                    setSelectedEvents((prev) =>
                      prev.includes(ev.id)
                        ? prev.filter((id) => id !== ev.id)
                        : [...prev, ev.id]
                    )
                  }
                  className={`text-left border rounded-lg p-3 transition-all ${
                    active
                      ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-base">{ev.emoji}</span>
                    <span className={`text-xs font-semibold ${active ? "text-blue-900" : "text-gray-700"}`}>
                      {ev.label}
                    </span>
                    {active && (
                      <span className="ml-auto text-blue-500 text-xs">✓</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 ml-6">{ev.description}</p>
                </button>
              )
            })}
          </div>

          {/* Results */}
          {selectedEvents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-2 pr-4 font-medium text-gray-500 min-w-[180px]">Cost Breakdown</th>
                    {plans.map((p) => (
                      <th key={p.id} className="text-left py-2 px-3 font-semibold min-w-[140px]">
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(() => {
                    const results = plans.map((p) => estimateAnnualCost(p, selectedEvents))
                    const lowestTotal = Math.min(...results.map((r) => r.totalWithPremiums))
                    return (
                      <>
                        <tr className="hover:bg-gray-50">
                          <td className="py-2 pr-4 text-gray-500 font-medium">Annual Premiums</td>
                          {results.map((r, i) => (
                            <td key={plans[i].id} className="py-2 px-3">{dollar(r.premiums)}</td>
                          ))}
                        </tr>
                        <tr className="hover:bg-gray-50">
                          <td className="py-2 pr-4 text-gray-500 font-medium">
                            <Link to="/plans/glossary#copay-copayment" className="hover:text-blue-600 hover:underline">
                              Copays <span className="text-gray-300 text-xs">↗</span>
                            </Link>
                          </td>
                          {results.map((r, i) => (
                            <td key={plans[i].id} className="py-2 px-3">{dollar(r.copays)}</td>
                          ))}
                        </tr>
                        <tr className="hover:bg-gray-50">
                          <td className="py-2 pr-4 text-gray-500 font-medium">
                            <Link to="/plans/glossary#deductible" className="hover:text-blue-600 hover:underline">
                              Deductible spend <span className="text-gray-300 text-xs">↗</span>
                            </Link>
                          </td>
                          {results.map((r, i) => (
                            <td key={plans[i].id} className="py-2 px-3">{dollar(r.deductibleSpend)}</td>
                          ))}
                        </tr>
                        <tr className="hover:bg-gray-50">
                          <td className="py-2 pr-4 text-gray-500 font-medium">
                            <Link to="/plans/glossary#coinsurance" className="hover:text-blue-600 hover:underline">
                              Coinsurance share <span className="text-gray-300 text-xs">↗</span>
                            </Link>
                          </td>
                          {results.map((r, i) => (
                            <td key={plans[i].id} className="py-2 px-3">{dollar(r.coinsuranceSpend)}</td>
                          ))}
                        </tr>
                        <tr className="hover:bg-gray-50 border-t-2">
                          <td className="py-2 pr-4 text-gray-500 font-medium">
                            <Link to="/plans/glossary#out-of-pocket-maximum-oop-max" className="hover:text-blue-600 hover:underline">
                              Total Out-of-Pocket <span className="text-gray-300 text-xs">↗</span>
                            </Link>
                          </td>
                          {results.map((r, i) => (
                            <td key={plans[i].id} className="py-2 px-3 font-medium">
                              {dollar(r.totalOop)}
                              {r.hitOopMax && (
                                <span className="text-[10px] text-amber-600 ml-1 font-normal">
                                  (hit OOP max)
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                        <tr className="bg-gray-50 font-bold">
                          <td className="py-3 pr-4 text-gray-900">
                            💰 Estimated Annual Cost
                          </td>
                          {results.map((r, i) => (
                            <td key={plans[i].id} className="py-3 px-3">
                              <span className={r.totalWithPremiums === lowestTotal ? "text-green-700" : "text-gray-900"}>
                                {dollar(r.totalWithPremiums)}
                              </span>
                              {r.totalWithPremiums === lowestTotal && results.length > 1 && (
                                <span className="text-[10px] text-green-600 ml-1 font-medium">
                                  ✓ lowest
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      </>
                    )
                  })()}
                </tbody>
              </table>

              <div className="mt-3 bg-gray-50 border rounded-lg p-3">
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  <strong>⚠️ These are estimates.</strong> Actual costs depend on specific providers, negotiated rates,
                  and whether services are in-network. This simulator uses your plan's copays, deductible, coinsurance,
                  and OOP max with average billed costs for each scenario. Use it to compare plans — not as a guarantee.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 border-2 border-dashed rounded-lg text-gray-400 text-sm">
              Select at least one life event above to see cost estimates.
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Main layout with tabs ──
  return (
    <div className={`mx-auto p-8 ${tab === "compare" ? "max-w-7xl" : "max-w-4xl"}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Insurance Plans</h1>
          <p className="text-sm text-gray-500 mt-1">
            {plans.length} plan{plans.length !== 1 ? "s" : ""} saved
          </p>
        </div>
        {tab === "plans" && (
          <button
            onClick={openNew}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            + Add Plan
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-6">
        <button
          onClick={() => setTab("plans")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "plans"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
        >
          My Plans
        </button>
        <button
          onClick={() => setTab("compare")}
          disabled={plans.length < 2}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "compare"
              ? "border-blue-600 text-blue-600"
              : plans.length < 2
                ? "border-transparent text-gray-300 cursor-not-allowed"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
          title={plans.length < 2 ? "Add at least 2 plans to compare" : ""}
        >
          Compare {plans.length >= 2 && `(${plans.length})`}
        </button>
      </div>

      {/* Guide banner */}
      {tab === "plans" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📖</span>
            <div>
              <span className="text-sm font-medium text-blue-900">New to insurance?</span>
              <span className="text-xs text-blue-700 ml-1.5">Our guide breaks down everything in plain English.</span>
            </div>
          </div>
          <Link to="/insurance-guide" className="text-xs text-blue-600 hover:underline font-semibold shrink-0">
            Understanding Your Insurance →
          </Link>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs font-bold">✕</button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm text-center py-16">Loading your plans…</p>
      ) : tab === "compare" ? (
        <CompareView />
      ) : plans.length === 0 && !showForm ? (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <h2 className="text-lg font-semibold mb-2">No plans yet</h2>
          <p className="text-gray-500 text-sm mb-6">
            Add your insurance plans to keep track of benefits and compare them side-by-side.
          </p>
          <button onClick={openNew} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700">
            Add Your First Plan
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div key={plan.id} className="border rounded-lg p-4 hover:bg-gray-50 transition group flex items-center justify-between">
              <button onClick={() => openEdit(plan)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm">{plan.name}</span>
                  {plan.metal_tier && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${METAL_COLORS[plan.metal_tier] ?? "bg-gray-100 text-gray-600"}`}>
                      {plan.metal_tier}
                    </span>
                  )}
                  {plan.plan_type && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {PLAN_TYPE_LABELS[plan.plan_type] ?? plan.plan_type}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {plan.carrier || "No carrier"} · {dollar(plan.monthly_premium)}/mo · Deductible {dollar(plan.annual_deductible)} · OOP Max {dollar(plan.oop_max)}
                </p>
              </button>
              <button
                onClick={() => setDeleteConfirmId(plan.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1 rounded ml-2"
                title="Delete plan"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Plan Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{editId ? "Edit Plan" : "Add Plan"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-lg font-bold">✕</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {/* Plan info */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Plan Name *</label>
                <input value={form.name} onChange={(e) => setField("name", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" placeholder="e.g. Blue Cross Gold PPO" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Carrier</label>
                <input value={form.carrier ?? ""} onChange={(e) => setField("carrier", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" placeholder="e.g. BCBS" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Plan Type</label>
                <select value={form.plan_type ?? "ppo"} onChange={(e) => setField("plan_type", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2">
                  <option value="hmo">HMO</option>
                  <option value="ppo">PPO</option>
                  <option value="epo">EPO</option>
                  <option value="pos">POS</option>
                  <option value="hdhp">HDHP</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Metal Tier</label>
                <select value={form.metal_tier ?? "silver"} onChange={(e) => setField("metal_tier", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2">
                  <option value="catastrophic">Catastrophic</option>
                  <option value="bronze">Bronze</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                  <option value="platinum">Platinum</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Member ID</label>
                <input value={form.member_id ?? ""} onChange={(e) => setField("member_id", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Group Number</label>
                <input value={form.group_number ?? ""} onChange={(e) => setField("group_number", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>

              {/* Costs */}
              <div className="sm:col-span-2 border-t pt-4 mt-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Costs</h3>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Monthly Premium</label>
                <input type="number" value={form.monthly_premium ?? 0} onChange={(e) => setField("monthly_premium", +e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Annual Deductible</label>
                <input type="number" value={form.annual_deductible ?? 0} onChange={(e) => setField("annual_deductible", +e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Family Deductible</label>
                <input type="number" value={form.family_deductible ?? ""} onChange={(e) => setField("family_deductible", e.target.value ? +e.target.value : null)}
                  className="w-full border rounded-lg px-3 py-2" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">OOP Max</label>
                <input type="number" value={form.oop_max ?? 0} onChange={(e) => setField("oop_max", +e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Family OOP Max</label>
                <input type="number" value={form.family_oop_max ?? ""} onChange={(e) => setField("family_oop_max", e.target.value ? +e.target.value : null)}
                  className="w-full border rounded-lg px-3 py-2" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Coinsurance (%)</label>
                <input type="number" value={form.coinsurance ?? 20} onChange={(e) => setField("coinsurance", +e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" min={0} max={100} />
              </div>

              {/* Copays */}
              <div className="sm:col-span-2 border-t pt-4 mt-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Copays</h3>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">PCP Visit</label>
                <input type="number" value={form.copay_primary ?? 0} onChange={(e) => setField("copay_primary", +e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Specialist</label>
                <input type="number" value={form.copay_specialist ?? 0} onChange={(e) => setField("copay_specialist", +e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Urgent Care</label>
                <input type="number" value={form.copay_urgent_care ?? 0} onChange={(e) => setField("copay_urgent_care", +e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">ER</label>
                <input type="number" value={form.copay_er ?? 0} onChange={(e) => setField("copay_er", +e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>

              {/* Rx */}
              <div className="sm:col-span-2 border-t pt-4 mt-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Prescriptions</h3>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Rx Generic</label>
                <input type="number" value={form.rx_generic ?? 0} onChange={(e) => setField("rx_generic", +e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Rx Preferred Brand</label>
                <input type="number" value={form.rx_preferred ?? 0} onChange={(e) => setField("rx_preferred", +e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Rx Specialty</label>
                <input type="number" value={form.rx_specialty ?? ""} onChange={(e) => setField("rx_specialty", e.target.value ? +e.target.value : null)}
                  className="w-full border rounded-lg px-3 py-2" placeholder="Optional" />
              </div>

              {/* Extras */}
              <div className="sm:col-span-2 border-t pt-4 mt-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Extras</h3>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.hsa_eligible ?? false} onChange={(e) => setField("hsa_eligible", e.target.checked)}
                  className="rounded" id="hsa" />
                <label htmlFor="hsa" className="text-xs font-medium text-gray-500">HSA Eligible</label>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Telehealth Copay</label>
                <input type="number" value={form.telehealth_copay ?? ""} onChange={(e) => setField("telehealth_copay", e.target.value ? +e.target.value : null)}
                  className="w-full border rounded-lg px-3 py-2" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Mental Health Copay</label>
                <input type="number" value={form.mental_health_copay ?? ""} onChange={(e) => setField("mental_health_copay", e.target.value ? +e.target.value : null)}
                  className="w-full border rounded-lg px-3 py-2" placeholder="Optional" />
              </div>

              {/* Employer */}
              <div className="sm:col-span-2 border-t pt-4 mt-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Employer (optional)</h3>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Employer Contribution ($/mo)</label>
                <input type="number" value={form.employer_contribution ?? ""} onChange={(e) => setField("employer_contribution", e.target.value ? +e.target.value : null)}
                  className="w-full border rounded-lg px-3 py-2" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Employee Cost ($/mo)</label>
                <input type="number" value={form.employee_cost ?? ""} onChange={(e) => setField("employee_cost", e.target.value ? +e.target.value : null)}
                  className="w-full border rounded-lg px-3 py-2" placeholder="Optional" />
              </div>

              {/* Notes */}
              <div className="sm:col-span-2 border-t pt-4 mt-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <textarea value={form.notes ?? ""} onChange={(e) => setField("notes", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2" rows={2} placeholder="Any notes…" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : editId ? "Save Changes" : "Add Plan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {renderDeleteModal()}
    </div>
  )
}
