import { useState, useEffect } from "react"
import { casesApi, configApi } from "@/lib/api"

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000"
async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

/**
 * Analytics — /analytics
 *
 * Dashboard showing platform usage, case stats, database health,
 * and reference data coverage at a glance.
 */

// ── Types ──

interface DbStats {
  cases: number
  lineItems: number
  documents: number
  disputes: number
  lcd: number
  articles: number
  ptp: number
  mue: number
  pfs: number
  siteConfig: number
}

interface CaseStatusBreakdown {
  status: string
  count: number
}

interface FlagSummary {
  bundling: number
  mue: number
  price: number
  total: number
}

interface RecentCase {
  id: string
  providerName: string
  state: string
  status: string
  totalBilled: number | null
  lineItems: number
  createdAt: string
}

// ── Helpers ──

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "K"
  return n.toLocaleString()
}

const STATUS_COLORS: Record<string, string> = {
  uploaded: "bg-gray-100 text-gray-700",
  ocr_processing: "bg-yellow-100 text-yellow-700",
  ocr_complete: "bg-blue-100 text-blue-700",
  codes_confirmed: "bg-indigo-100 text-indigo-700",
  analyzed: "bg-green-100 text-green-700",
  letters_ready: "bg-green-100 text-green-800",
  disputed: "bg-purple-100 text-purple-700",
  resolved: "bg-emerald-100 text-emerald-800",
}

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

// ── Main ──

export default function Analytics() {
  const [db, setDb] = useState<DbStats | null>(null)
  const [statuses, setStatuses] = useState<CaseStatusBreakdown[]>([])
  const [flags, setFlags] = useState<FlagSummary>({ bundling: 0, mue: 0, price: 0, total: 0 })
  const [recent, setRecent] = useState<RecentCase[]>([])
  const [loading, setLoading] = useState(true)
  const [topCpts, setTopCpts] = useState<Array<{ code: string; desc: string; count: number }>>([])

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      // Fetch stats from a lightweight backend endpoint
      const [statsRes, casesRes] = await Promise.all([
        request<{
          cases: number
          line_items: number
          documents: number
          disputes: number
          lcd: number
          articles: number
          ptp: number
          mue: number
          pfs: number
          site_config: number
          statuses: Array<{ status: string; count: number }>
          flag_summary: { bundling: number; mue: number; price: number; total: number }
          top_cpts: Array<{ code: string; description: string; count: number }>
        }>("/api/analytics/summary"),
        casesApi.list(),
      ])

      setDb({
        cases: statsRes.cases,
        lineItems: statsRes.line_items,
        documents: statsRes.documents,
        disputes: statsRes.disputes,
        lcd: statsRes.lcd,
        articles: statsRes.articles,
        ptp: statsRes.ptp,
        mue: statsRes.mue,
        pfs: statsRes.pfs,
        siteConfig: statsRes.site_config,
      })
      setStatuses(statsRes.statuses.map(s => ({ status: s.status, count: s.count })))
      setFlags(statsRes.flag_summary)
      setTopCpts(statsRes.top_cpts.map(c => ({ code: c.code, desc: c.description, count: c.count })))

      // Recent cases
      const sorted = [...casesRes].sort((a, b) =>
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      )
      setRecent(sorted.slice(0, 10).map(c => ({
        id: c.id,
        providerName: (c as any).providerName ?? (c as any).provider_name ?? "",
        state: (c as any).state ?? "",
        status: (c as any).status ?? "uploaded",
        totalBilled: (c as any).totalBilled ?? (c as any).total_billed ?? null,
        lineItems: (c as any).lineItemCount ?? (c as any).line_item_count ?? 0,
        createdAt: (c as any).createdAt ?? (c as any).created_at ?? "",
      })))
    } catch (err) {
      console.error("Analytics load failed:", err)
      // Still try to show what we can
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-8 text-center text-gray-400 text-sm py-24">
        Loading analytics…
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-1">Analytics Dashboard</h1>
      <p className="text-gray-600 text-sm mb-8">Platform usage, case pipeline, and reference data health.</p>

      {/* ── Row 1: Key metrics ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Cases", value: db?.cases ?? 0, icon: "📁", color: "bg-blue-50 text-blue-800" },
          { label: "Line Items Analyzed", value: db?.lineItems ?? 0, icon: "🧾", color: "bg-green-50 text-green-800" },
          { label: "Documents Uploaded", value: db?.documents ?? 0, icon: "📄", color: "bg-purple-50 text-purple-800" },
          { label: "Issues Found", value: flags.total, icon: "⚠️", color: "bg-orange-50 text-orange-800" },
        ].map(m => (
          <div key={m.label} className={`rounded-xl p-4 ${m.color}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{m.icon}</span>
            </div>
            <div className="text-2xl font-bold">{fmt(m.value)}</div>
            <div className="text-xs opacity-75 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* ── Row 2: Case pipeline + Flag breakdown ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Case pipeline */}
        <div className="border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">Case Pipeline</h2>
          {statuses.length === 0 ? (
            <p className="text-xs text-gray-400">No cases yet.</p>
          ) : (
            <div className="space-y-2">
              {statuses.map(s => {
                const pct = db?.cases ? Math.round((s.count / db.cases) * 100) : 0
                return (
                  <div key={s.status}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {statusLabel(s.status)}
                      </span>
                      <span className="text-gray-500">{s.count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Flag breakdown */}
        <div className="border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">Issues Found by Type</h2>
          {flags.total === 0 ? (
            <p className="text-xs text-gray-400">No flags yet. Analyze some cases to see data here.</p>
          ) : (
            <div className="space-y-3">
              {[
                { label: "🔗 Bundling Errors (NCCI)", count: flags.bundling, color: "bg-red-500" },
                { label: "📊 MUE Violations", count: flags.mue, color: "bg-purple-500" },
                { label: "💲 Excessive Pricing", count: flags.price, color: "bg-orange-500" },
              ].map(f => {
                const pct = flags.total ? Math.round((f.count / flags.total) * 100) : 0
                return (
                  <div key={f.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">{f.label}</span>
                      <span className="text-gray-500">{f.count} ({pct}%)</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${f.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
              <div className="pt-2 border-t text-xs text-gray-500">
                Total: {flags.total} issue{flags.total !== 1 ? "s" : ""} across all cases
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Top CPT codes + Reference database health ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Top CPTs */}
        <div className="border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">Most Billed CPT Codes</h2>
          {topCpts.length === 0 ? (
            <p className="text-xs text-gray-400">No line items yet.</p>
          ) : (
            <div className="space-y-2">
              {topCpts.map((c, i) => (
                <div key={c.code} className="flex items-center gap-3 text-xs">
                  <span className="w-5 text-right text-gray-400 font-mono">{i + 1}.</span>
                  <span className="font-mono font-medium text-gray-700 w-14">{c.code}</span>
                  <span className="flex-1 truncate text-gray-600">{c.desc}</span>
                  <span className="text-gray-400">{c.count}×</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reference data health */}
        <div className="border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">Reference Database Health</h2>
          <div className="space-y-2">
            {[
              { label: "NCCI PTP Edits", count: db?.ptp ?? 0, target: 4_500_000, icon: "🔗" },
              { label: "MUE Limits", count: db?.mue ?? 0, target: 30_000, icon: "📊" },
              { label: "PFS RVU Entries", count: db?.pfs ?? 0, target: 19_000, icon: "💲" },
              { label: "Local Coverage Determinations", count: db?.lcd ?? 0, target: 1_000, icon: "📋" },
              { label: "LCD Articles", count: db?.articles ?? 0, target: 500, icon: "📑" },
              { label: "Site Config Entries", count: db?.siteConfig ?? 0, target: 10, icon: "⚙️" },
            ].map(r => {
              const healthy = r.count >= r.target * 0.5
              return (
                <div key={r.label} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <span>{r.icon}</span>
                    <span>{r.label}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono font-medium">{fmt(r.count)}</span>
                    <span className={`w-2 h-2 rounded-full ${healthy ? "bg-green-500" : "bg-red-500"}`} />
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Row 4: Recent cases ── */}
      <div className="border rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-5 py-3 border-b">
          <h2 className="font-semibold text-sm">Recent Cases</h2>
        </div>
        {recent.length === 0 ? (
          <div className="p-5 text-xs text-gray-400 text-center">No cases yet.</div>
        ) : (
          <div className="divide-y">
            {recent.map(c => (
              <a
                key={c.id}
                href={`/cases/${c.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {c.providerName || "Untitled Case"}
                    </span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {statusLabel(c.status)}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {c.state && `${c.state} · `}
                    {c.lineItems} line item{c.lineItems !== 1 ? "s" : ""}
                    {c.totalBilled != null && ` · $${c.totalBilled.toLocaleString()}`}
                  </div>
                </div>
                <div className="text-xs text-gray-400 shrink-0 ml-4">
                  {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
