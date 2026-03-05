/**
 * AdminCases — /admin/cases
 *
 * Admin view of ALL cases across all users and guests.
 * Same card-based layout as the user's "My Cases" list,
 * but shows everything and includes owner info.
 */

import { useState, useEffect, useCallback } from "react"
import { Link, useNavigate } from "react-router-dom"
import { adminApi } from "@/lib/api"
import type { CaseType } from "@/types"

interface CaseSummary {
  id: string
  case_type: string
  status: string
  state?: string | null
  provider_name?: string | null
  total_billed?: number | null
  savings_found: number
  created_at?: string | null
  user_id?: string | null
  user_email?: string | null
  user_name?: string | null
  guest_id?: string | null
  owner_label?: string | null
}

const statusConfig: Record<string, { label: string; color: string }> = {
  uploaded:        { label: "Uploaded",        color: "bg-gray-100 text-gray-700" },
  ocr_processing:  { label: "Processing…",    color: "bg-blue-100 text-blue-800" },
  needs_review:    { label: "Needs Review",   color: "bg-amber-100 text-amber-800" },
  analyzing:       { label: "Analyzing…",     color: "bg-blue-100 text-blue-800" },
  analyzed:        { label: "Analysis Ready", color: "bg-green-100 text-green-800" },
  letters_ready:   { label: "Letters Ready",  color: "bg-green-100 text-green-800" },
  disputed:        { label: "Disputed",       color: "bg-purple-100 text-purple-800" },
  resolved:        { label: "Resolved",       color: "bg-emerald-100 text-emerald-800" },
  closed:          { label: "Closed",         color: "bg-gray-100 text-gray-500" },
}

export default function AdminCases() {
  const navigate = useNavigate()
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<CaseType | "">("")
  const [sortBy, setSortBy] = useState<"date" | "owner">("date")
  const [ownerFilter, setOwnerFilter] = useState("")

  const fetchCases = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminApi.listCases(filter ? { type: filter as CaseType } : undefined)
      setCases(data as unknown as CaseSummary[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cases")
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { fetchCases() }, [fetchCases])

  // ── Unique owner labels for the filter dropdown ──
  const uniqueOwners = Array.from(new Set(cases.map((c) => c.owner_label ?? "Unknown"))).sort()

  // ── Filter by owner, then sort ──
  const filtered = ownerFilter
    ? cases.filter((c) => (c.owner_label ?? "Unknown") === ownerFilter)
    : cases

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "owner") {
      const oa = (a.owner_label ?? "Unknown").toLowerCase()
      const ob = (b.owner_label ?? "Unknown").toLowerCase()
      if (oa !== ob) return oa.localeCompare(ob)
    }
    // secondary sort: newest first
    return (b.created_at ?? "").localeCompare(a.created_at ?? "")
  })

  const billingCases = sorted.filter((c) => c.case_type === "billing")
  const priorAuthCases = sorted.filter((c) => c.case_type === "prior_auth")
  const physicianCases = sorted.filter((c) => c.case_type === "physician")

  function renderCaseCard(c: CaseSummary) {
    const sc = statusConfig[c.status] ?? statusConfig.uploaded
    return (
      <div
        key={c.id}
        className="w-full text-left border rounded-lg p-4 hover:bg-gray-50 transition flex items-center justify-between group"
      >
        <button
          onClick={() => navigate(`/cases/${c.id}`)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-sm">
              {c.provider_name || "Unnamed Provider"}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${sc.color}`}>
              {sc.label}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            {c.state || "No state"} · {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
            <span className="ml-2 font-mono text-gray-400">{c.id.slice(0, 8)}</span>
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); setOwnerFilter(c.owner_label ?? "Unknown") }}
              className="hover:text-blue-600 hover:underline"
            >
              {c.owner_label ?? "Unknown owner"}
            </button>
          </p>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            {c.total_billed != null && (
              <span className="font-semibold text-sm">
                ${c.total_billed.toLocaleString()}
              </span>
            )}
            {c.savings_found > 0 && (
              <p className="text-xs text-green-600 font-medium">
                ${c.savings_found.toLocaleString()} savings
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Review &amp; Edit Cases</h1>
          <p className="text-sm text-gray-500 mt-1">
            {cases.length} case{cases.length !== 1 ? "s" : ""} across all users and guests
            {ownerFilter && <span className="ml-1 font-medium text-gray-700">· filtered to {ownerFilter}</span>}
          </p>
        </div>
        <Link
          to="/admin/users"
          className="text-sm text-blue-600 hover:underline"
        >
          Users →
        </Link>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as CaseType | "")}
          className="border rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">All Types</option>
          <option value="billing">Billing</option>
          <option value="prior_auth">Prior Auth</option>
          <option value="physician">Physician</option>
        </select>
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">All Owners</option>
          {uniqueOwners.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "date" | "owner")}
          className="border rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="date">Sort: Newest</option>
          <option value="owner">Sort: Owner</option>
        </select>
        {ownerFilter && (
          <button
            onClick={() => setOwnerFilter("")}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Clear filter
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16">
          <p className="text-gray-500 text-sm">Loading cases…</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-4 text-sm">
          {error}
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <p className="text-gray-500">No cases found.</p>
        </div>
      ) : filter || ownerFilter || sortBy === "owner" ? (
        /* Filtered / sorted by owner — flat list */
        <div className="space-y-3">
          {sorted.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed rounded-lg">
              <p className="text-gray-500">No cases match this filter.</p>
            </div>
          ) : sorted.map(renderCaseCard)}
        </div>
      ) : (
        /* All types — split columns like the normal Cases page */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
              Billing Disputes
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {billingCases.length}
              </span>
            </h2>
            {billingCases.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed rounded-lg">
                <p className="text-sm text-gray-400">No billing cases.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {billingCases.map(renderCaseCard)}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
              Prior Authorization Disputes
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {priorAuthCases.length}
              </span>
            </h2>
            {priorAuthCases.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed rounded-lg">
                <p className="text-sm text-gray-400">No prior auth cases.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {priorAuthCases.map(renderCaseCard)}
              </div>
            )}

            {physicianCases.length > 0 && (
              <>
                <h2 className="text-lg font-semibold flex items-center gap-2 mt-8 mb-3">
                  Physician
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {physicianCases.length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {physicianCases.map(renderCaseCard)}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
