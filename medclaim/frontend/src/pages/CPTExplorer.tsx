import { useState, useEffect } from "react"
import { cptExplorerApi } from "@/lib/api"

/**
 * CPT Explorer — browse and search all CPT/HCPCS procedure codes.
 *
 * Features:
 * - Range sidebar for quick navigation (00000–09999, 10000–19999, etc.)
 * - Full-text search by code or description
 * - Click a row to see RVU breakdown in a detail panel
 * - Color-coded status badges
 */

type CPTRow = {
  code: string
  description: string | null
  statusCode: string | null
  workRvu: number | null
  nonfacPeRvu: number | null
  facilityPeRvu: number | null
  mpRvu: number | null
  nonfacTotal: number | null
  facilityTotal: number | null
  convFactor: number | null
}

type Range = { range: string; count: number }

const CF = 33.4009

const STATUS_LABELS: Record<string, string> = {
  A: "Active",
  B: "Bundled",
  C: "Carrier priced",
  D: "Deleted",
  E: "Excluded",
  I: "Not valid for Medicare",
  J: "Anesthesia",
  N: "Non-covered",
  P: "Bundled/excluded",
  R: "Restricted",
  T: "Injections",
  X: "Statutory exclusion",
}

const STATUS_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-700",
  B: "bg-amber-100 text-amber-700",
  I: "bg-gray-100 text-gray-500",
  J: "bg-indigo-100 text-indigo-700",
  N: "bg-red-100 text-red-700",
  D: "bg-red-100 text-red-600",
}

const RANGE_LABELS: Record<string, string> = {
  "00000": "Anesthesia (00100–01999)",
  "10000": "Surgery (10000–19999)",
  "20000": "Surgery (20000–29999)",
  "30000": "Surgery (30000–39999)",
  "40000": "Surgery (40000–49999)",
  "50000": "Surgery (50000–59999)",
  "60000": "Surgery (60000–69999)",
  "70000": "Radiology (70000–79999)",
  "80000": "Path & Lab (80000–89999)",
  "90000": "Medicine (90000–99999)",
}

export default function CPTExplorer() {
  const [search, setSearch] = useState("")
  const [rangeStart, setRangeStart] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<CPTRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [ranges, setRanges] = useState<Range[]>([])
  const [selected, setSelected] = useState<CPTRow | null>(null)
  const pageSize = 100

  async function fetchData(pg = 1, rs = rangeStart, srch = search) {
    setLoading(true)
    try {
      // Calculate range end from range start
      let rEnd: string | undefined
      if (rs && /^\d+$/.test(rs)) {
        rEnd = String(parseInt(rs) + 9999)
      }
      const data = await cptExplorerApi.browse({
        search: srch || undefined,
        rangeStart: rs || undefined,
        rangeEnd: rEnd,
        page: pg,
        pageSize,
      })
      setRows(data.rows)
      setTotal(data.total)
      setTotalPages(data.totalPages)
      if (data.ranges?.length) setRanges(data.ranges)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetchData(1, null, "") }, [])

  function handleSearch() {
    setPage(1)
    setRangeStart(null)
    setSelected(null)
    fetchData(1, null, search)
  }

  function selectRange(rs: string | null) {
    setRangeStart(rs)
    setSearch("")
    setPage(1)
    setSelected(null)
    fetchData(1, rs, "")
  }

  function goPage(pg: number) {
    setPage(pg)
    setSelected(null)
    fetchData(pg)
  }

  const fmt = (v: number | null) => v != null ? v.toFixed(2) : "—"

  return (
    <div className="max-w-7xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-1">CPT / HCPCS Explorer</h1>
      <p className="text-gray-600 text-sm mb-6">
        Browse {total > 0 ? total.toLocaleString() : "17,000+"} CPT and HCPCS procedure codes
        from the Medicare Physician Fee Schedule and LCD databases.
        Click any code to see its RVU breakdown and Medicare rate.
      </p>

      {/* Search */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by code or description (e.g. 27447, knee, arthroplasty)…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          className="flex-1 max-w-lg border rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={handleSearch}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          Search
        </button>
        {rangeStart && (
          <button
            onClick={() => selectRange(null)}
            className="text-xs text-blue-600 hover:underline"
          >
            Clear range filter
          </button>
        )}
        <div className="text-xs text-gray-500 ml-auto">
          {total.toLocaleString()} code{total !== 1 ? "s" : ""}
          {rangeStart && ` in range ${rangeStart}–${parseInt(rangeStart) + 9999}`}
        </div>
      </div>

      <div className="flex gap-6">
        {/* ── Range sidebar ── */}
        <div className="w-52 shrink-0 hidden md:block">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Code Ranges</h3>
          <div className="space-y-0.5 max-h-[calc(100vh-200px)] overflow-y-auto">
            <button
              onClick={() => selectRange(null)}
              className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors ${
                !rangeStart ? "bg-blue-100 text-blue-800 font-semibold" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              All Codes
            </button>
            {ranges.map(r => {
              const isNumeric = /^\d+$/.test(r.range)
              const label = isNumeric
                ? RANGE_LABELS[r.range] || `${r.range}–${parseInt(r.range) + 9999}`
                : `HCPCS ${r.range}xxx`
              return (
                <button
                  key={r.range}
                  onClick={() => selectRange(isNumeric ? r.range : r.range)}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${
                    rangeStart === r.range
                      ? "bg-blue-100 text-blue-800 font-semibold"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <span className="truncate">{label}</span>
                  <span className="text-gray-400 font-mono text-[10px]">{r.count.toLocaleString()}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0">
          <div className={`grid gap-6 ${selected ? "grid-cols-1 xl:grid-cols-3" : ""}`}>
            {/* Table */}
            <div className={selected ? "xl:col-span-2" : ""}>
              {loading ? (
                <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium text-gray-500 w-24">Code</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-500">Description</th>
                          <th className="text-center px-3 py-3 font-medium text-gray-500 w-20">Status</th>
                          <th className="text-right px-3 py-3 font-medium text-gray-500 w-24">NF Rate</th>
                          <th className="text-right px-3 py-3 font-medium text-gray-500 w-24">Fac Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr
                            key={`${r.code}-${i}`}
                            onClick={() => setSelected(r)}
                            className={`border-t cursor-pointer transition-colors ${
                              selected?.code === r.code
                                ? "bg-blue-50 border-l-2 border-l-blue-500"
                                : i % 2 ? "bg-gray-50/30 hover:bg-blue-50/50" : "hover:bg-blue-50/50"
                            }`}
                          >
                            <td className="px-4 py-2 font-mono font-semibold text-blue-700">{r.code}</td>
                            <td className="px-4 py-2 text-gray-600 text-xs truncate max-w-[300px]">
                              {r.description || <span className="text-gray-300 italic">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {r.statusCode && (
                                <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  STATUS_COLORS[r.statusCode] || "bg-gray-100 text-gray-600"
                                }`} title={STATUS_LABELS[r.statusCode] || r.statusCode}>
                                  {r.statusCode}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-mono">
                              {r.nonfacTotal ? (
                                <span className="font-semibold text-green-700">${(r.nonfacTotal * CF).toFixed(0)}</span>
                              ) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-mono">
                              {r.facilityTotal ? (
                                <span className="font-semibold text-teal-700">${(r.facilityTotal * CF).toFixed(0)}</span>
                              ) : "—"}
                            </td>
                          </tr>
                        ))}
                        {rows.length === 0 && (
                          <tr>
                            <td colSpan={5} className="text-center py-12 text-gray-400 text-sm">
                              No CPT codes found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={() => goPage(1)}
                    disabled={page <= 1}
                    className="px-2 py-1 border rounded text-xs disabled:opacity-40 hover:bg-gray-50"
                  >
                    ««
                  </button>
                  <button
                    onClick={() => goPage(page - 1)}
                    disabled={page <= 1}
                    className="px-3 py-1 border rounded text-xs disabled:opacity-40 hover:bg-gray-50"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
                  <button
                    onClick={() => goPage(page + 1)}
                    disabled={page >= totalPages}
                    className="px-3 py-1 border rounded text-xs disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next →
                  </button>
                  <button
                    onClick={() => goPage(totalPages)}
                    disabled={page >= totalPages}
                    className="px-2 py-1 border rounded text-xs disabled:opacity-40 hover:bg-gray-50"
                  >
                    »»
                  </button>
                </div>
              )}
            </div>

            {/* ── Detail sidebar ── */}
            {selected && (
              <div className="xl:col-span-1">
                <div className="border rounded-lg bg-white sticky top-8">
                  <div className="bg-blue-50 border-b px-5 py-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xl font-bold text-blue-800">{selected.code}</span>
                      <button onClick={() => setSelected(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                    {selected.statusCode && (
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded mb-2 ${
                        STATUS_COLORS[selected.statusCode] || "bg-gray-100 text-gray-600"
                      }`}>
                        {STATUS_LABELS[selected.statusCode] || selected.statusCode}
                      </span>
                    )}
                    <p className="text-sm text-gray-700">{selected.description || "No description"}</p>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* RVU components */}
                    {(selected.workRvu != null || selected.nonfacPeRvu != null) && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">RVU Components</h4>
                        <div className="space-y-2">
                          <RVUBar label="Work" value={selected.workRvu} color="blue" />
                          <RVUBar label="NF Prac Expense" value={selected.nonfacPeRvu} color="green" />
                          <RVUBar label="Fac Prac Expense" value={selected.facilityPeRvu} color="teal" />
                          <RVUBar label="Malpractice" value={selected.mpRvu} color="orange" />
                        </div>
                      </div>
                    )}

                    {/* Payment */}
                    {(selected.nonfacTotal || selected.facilityTotal) && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Medicare Rate (National)</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-green-50 border border-green-200 rounded p-3 text-center">
                            <div className="text-[10px] text-green-600 mb-1">Non-Facility</div>
                            <div className="text-lg font-bold text-green-800">
                              {selected.nonfacTotal ? `$${(selected.nonfacTotal * CF).toFixed(2)}` : "—"}
                            </div>
                            <div className="text-[10px] text-green-400">
                              {fmt(selected.nonfacTotal)} RVU
                            </div>
                          </div>
                          <div className="bg-teal-50 border border-teal-200 rounded p-3 text-center">
                            <div className="text-[10px] text-teal-600 mb-1">Facility</div>
                            <div className="text-lg font-bold text-teal-800">
                              {selected.facilityTotal ? `$${(selected.facilityTotal * CF).toFixed(2)}` : "—"}
                            </div>
                            <div className="text-[10px] text-teal-400">
                              {fmt(selected.facilityTotal)} RVU
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* No RVU data */}
                    {selected.workRvu == null && selected.nonfacTotal == null && (
                      <div className="bg-gray-50 rounded p-4 text-center">
                        <p className="text-xs text-gray-500">
                          No RVU data available for this code.
                          {selected.statusCode === "B" && " This code is bundled into another code."}
                          {selected.statusCode === "I" && " This code is not valid for Medicare."}
                          {!selected.statusCode && " This code was found in LCD article data only."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── RVU bar ── */

function RVUBar({ label, value, color }: { label: string; value: number | null; color: string }) {
  if (value == null) return null
  const maxWidth = 6
  const pct = Math.min((value / maxWidth) * 100, 100)
  const colorMap: Record<string, string> = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    teal: "bg-teal-500",
    orange: "bg-orange-500",
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-28 text-right">{label}</span>
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div
          className={`${colorMap[color]} h-2 rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono font-semibold w-10 text-right">{value.toFixed(2)}</span>
    </div>
  )
}
