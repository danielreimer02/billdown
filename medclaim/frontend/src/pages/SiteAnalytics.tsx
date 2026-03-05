import { useState, useEffect, useCallback } from "react"

const BASE_URL = import.meta.env.VITE_API_URL ?? ""

async function authedGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("mc_token")
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

/**
 * SiteAnalytics — /admin/site-analytics
 *
 * Shows who has accessed the site, referrers, page popularity,
 * usage patterns (hourly distribution), and recent visitor log.
 */

// ── Types ──

interface SiteSummary {
  total_views: number
  unique_visitors: number
  auth_users: number
  views_today: number
  views_7d: number
  views_30d: number
  top_pages: Array<{ path: string; views: number; unique_visitors: number }>
  top_referrers: Array<{ referrer: string; count: number }>
  daily_views: Array<{ day: string; views: number; visitors: number }>
  hourly_distribution: Array<{ hour: number; views: number }>
  recent_visitors: Array<{
    path: string
    referrer: string | null
    ip: string | null
    user_agent: string
    session_id: string | null
    user_email: string | null
    time: string
  }>
}

// ── Helpers ──

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "K"
  return n.toLocaleString()
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function hourLabel(h: number): string {
  if (h === 0) return "12 AM"
  if (h < 12) return `${h} AM`
  if (h === 12) return "12 PM"
  return `${h - 12} PM`
}

function cleanReferrer(r: string): string {
  try {
    const url = new URL(r)
    return url.hostname + (url.pathname !== "/" ? url.pathname : "")
  } catch {
    return r.length > 50 ? r.slice(0, 50) + "…" : r
  }
}

// ── Main ──

export default function SiteAnalytics() {
  const [data, setData] = useState<SiteSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await authedGet<SiteSummary>("/api/site-analytics/summary")
      setData(res)
    } catch (err: any) {
      setError(err.message || "Failed to load analytics")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-8 text-center text-gray-400 text-sm py-24">
        Loading site analytics…
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-8 text-center">
        <p className="text-red-500 text-sm mb-3">Error: {error}</p>
        <button onClick={load} className="text-blue-600 text-sm hover:underline">Retry</button>
      </div>
    )
  }

  if (!data) return null

  const maxDailyViews = Math.max(...(data.daily_views.map(d => d.views)), 1)
  const maxHourlyViews = Math.max(...(data.hourly_distribution.map(h => h.views)), 1)

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">Site Analytics</h1>
          <p className="text-gray-600 text-sm">Visitor traffic, page popularity, referral sources, and usage patterns.</p>
        </div>
        <button
          onClick={load}
          className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 text-gray-600"
        >
          ↻ Refresh
        </button>
      </div>

      {/* ── Row 1: Key metrics ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: "Total Page Views", value: data.total_views, icon: "👁️", color: "bg-blue-50 text-blue-800" },
          { label: "Unique Visitors", value: data.unique_visitors, icon: "👤", color: "bg-green-50 text-green-800" },
          { label: "Auth Users", value: data.auth_users, icon: "🔑", color: "bg-purple-50 text-purple-800" },
          { label: "Views Today", value: data.views_today, icon: "📅", color: "bg-orange-50 text-orange-800" },
          { label: "Last 7 Days", value: data.views_7d, icon: "📊", color: "bg-cyan-50 text-cyan-800" },
          { label: "Last 30 Days", value: data.views_30d, icon: "📈", color: "bg-indigo-50 text-indigo-800" },
        ].map(m => (
          <div key={m.label} className={`rounded-xl p-4 ${m.color}`}>
            <span className="text-xl">{m.icon}</span>
            <div className="text-2xl font-bold mt-1">{fmt(m.value)}</div>
            <div className="text-xs opacity-75 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* ── Row 2: Daily trend + Hourly distribution ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Daily trend */}
        <div className="border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">Daily Traffic (Last 30 Days)</h2>
          {data.daily_views.length === 0 ? (
            <p className="text-xs text-gray-400">No data yet.</p>
          ) : (
            <div className="flex items-end gap-[2px] h-32">
              {data.daily_views.map(d => {
                const pct = (d.views / maxDailyViews) * 100
                return (
                  <div
                    key={d.day}
                    className="flex-1 bg-blue-500 rounded-t hover:bg-blue-600 transition-colors group relative"
                    style={{ height: `${Math.max(pct, 2)}%` }}
                    title={`${d.day}: ${d.views} views, ${d.visitors} visitors`}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                      {new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: {d.views} views
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>{data.daily_views[0]?.day ? new Date(data.daily_views[0].day).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
            <span>Today</span>
          </div>
        </div>

        {/* Hourly distribution */}
        <div className="border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">Usage by Hour of Day</h2>
          {data.hourly_distribution.length === 0 ? (
            <p className="text-xs text-gray-400">No data yet.</p>
          ) : (
            <>
              <div className="flex items-end gap-[2px] h-32">
                {Array.from({ length: 24 }, (_, h) => {
                  const entry = data.hourly_distribution.find(e => e.hour === h)
                  const views = entry?.views ?? 0
                  const pct = (views / maxHourlyViews) * 100
                  return (
                    <div
                      key={h}
                      className="flex-1 bg-indigo-400 rounded-t hover:bg-indigo-500 transition-colors group relative"
                      style={{ height: `${Math.max(pct, 2)}%` }}
                      title={`${hourLabel(h)}: ${views} views`}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                        {hourLabel(h)}: {views} views
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>12 AM</span>
                <span>6 AM</span>
                <span>12 PM</span>
                <span>6 PM</span>
                <span>12 AM</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Row 3: Top pages + Top referrers ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Top pages */}
        <div className="border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">Most Visited Pages</h2>
          {data.top_pages.length === 0 ? (
            <p className="text-xs text-gray-400">No page views recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {data.top_pages.map((p, i) => {
                const pct = data.views_30d ? Math.round((p.views / data.views_30d) * 100) : 0
                return (
                  <div key={p.path}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-gray-400 font-mono w-5 text-right shrink-0">{i + 1}.</span>
                        <span className="font-medium text-gray-700 truncate">{p.path}</span>
                      </span>
                      <span className="text-gray-500 shrink-0 ml-2">
                        {p.views} views · {p.unique_visitors} visitors
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Top referrers */}
        <div className="border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4">Top Referral Sources</h2>
          {data.top_referrers.length === 0 ? (
            <p className="text-xs text-gray-400">No referral data yet. Referrers appear when visitors arrive from external links.</p>
          ) : (
            <div className="space-y-2">
              {data.top_referrers.map((r, i) => {
                const maxRef = data.top_referrers[0]?.count ?? 1
                const pct = Math.round((r.count / maxRef) * 100)
                return (
                  <div key={r.referrer}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-gray-400 font-mono w-5 text-right shrink-0">{i + 1}.</span>
                        <span className="font-medium text-gray-700 truncate" title={r.referrer}>
                          {cleanReferrer(r.referrer)}
                        </span>
                      </span>
                      <span className="text-gray-500 shrink-0 ml-2">{r.count} visits</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: Recent visitors ── */}
      <div className="border rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-5 py-3 border-b">
          <h2 className="font-semibold text-sm">Recent Visitors</h2>
        </div>
        {data.recent_visitors.length === 0 ? (
          <div className="p-5 text-xs text-gray-400 text-center">No visitors recorded yet.</div>
        ) : (
          <div className="divide-y">
            {data.recent_visitors.map((v, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 truncate">{v.path}</span>
                    {v.user_email && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                        {v.user_email}
                      </span>
                    )}
                    {!v.user_email && v.session_id && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                        {v.session_id}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {v.referrer && v.referrer !== "null" && (
                      <span>from {cleanReferrer(v.referrer)} · </span>
                    )}
                    {v.ip && <span>{v.ip} · </span>}
                    {v.user_agent && <span className="truncate">{v.user_agent}</span>}
                  </div>
                </div>
                <div className="text-gray-400 shrink-0 ml-4 text-right">
                  <div>{v.time ? timeAgo(v.time) : ""}</div>
                  <div className="text-[10px]">{v.time ? new Date(v.time).toLocaleString() : ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
