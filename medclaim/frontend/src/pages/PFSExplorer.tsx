import { useState, useEffect } from "react"
import { pfsExplorerApi } from "@/lib/api"

/**
 * PFS Explorer — browse and search the Medicare Physician Fee Schedule.
 *
 * Shows RVU components (Work, PE, MP), totals for facility and non-facility,
 * and the conversion factor used to calculate Medicare payment amounts.
 */

type PFSRow = {
  hcpcs: string
  description: string
  statusCode: string
  workRvu: number
  nonfacPeRvu: number
  facilityPeRvu: number
  mpRvu: number
  nonfacTotal: number
  facilityTotal: number
  convFactor: number
}

const CF = 33.4009

const STATUS_LABELS: Record<string, string> = {
  A: "Active",
  B: "Bundled",
  C: "Carrier priced",
  D: "Deleted",
  E: "Excluded",
  I: "Not valid for Medicare",
  N: "Non-covered",
  P: "Bundled/excluded",
  R: "Restricted coverage",
  T: "Injections",
  X: "Statutory exclusion",
}

export default function PFSExplorer() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<PFSRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [selectedRow, setSelectedRow] = useState<PFSRow | null>(null)
  const pageSize = 50

  async function fetchData(pg = 1) {
    setLoading(true)
    try {
      const data = await pfsExplorerApi.browse({
        search: search || undefined,
        page: pg,
        pageSize,
      })
      setRows(data.rows)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetchData(1) }, [])

  function handleSearch() {
    setPage(1)
    setSelectedRow(null)
    fetchData(1)
  }

  function goPage(pg: number) {
    setPage(pg)
    setSelectedRow(null)
    fetchData(pg)
  }

  const fmt = (v: number | null) => v != null ? v.toFixed(2) : "—"
  const fmtDollar = (v: number | null) => v != null ? `$${(v * CF).toFixed(2)}` : "—"

  return (
    <div className="max-w-7xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">PFS Explorer</h1>
      <p className="text-gray-600 text-sm mb-6">
        Browse the Medicare Physician Fee Schedule. Every CPT code has Work, Practice Expense,
        and Malpractice RVU components that determine its Medicare payment rate.
        Current Conversion Factor: <span className="font-mono font-semibold">${CF}</span>.
      </p>

      {/* Search */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by CPT code or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          className="flex-1 max-w-md border rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={handleSearch}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          Search
        </button>
        <div className="text-xs text-gray-500 ml-auto">
          {total.toLocaleString()} result{total !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table */}
        <div className={selectedRow ? "lg:col-span-2" : "lg:col-span-3"}>
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-3 font-medium text-gray-500 w-20">HCPCS</th>
                      <th className="text-left px-3 py-3 font-medium text-gray-500">Description</th>
                      <th className="text-center px-3 py-3 font-medium text-gray-500 w-16">Work</th>
                      <th className="text-center px-3 py-3 font-medium text-gray-500 w-16">NF PE</th>
                      <th className="text-center px-3 py-3 font-medium text-gray-500 w-16">Fac PE</th>
                      <th className="text-center px-3 py-3 font-medium text-gray-500 w-16">MP</th>
                      <th className="text-right px-3 py-3 font-medium text-gray-500 w-24">NF Rate</th>
                      <th className="text-right px-3 py-3 font-medium text-gray-500 w-24">Fac Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={`${r.hcpcs}-${i}`}
                        onClick={() => setSelectedRow(r)}
                        className={`border-t cursor-pointer transition-colors ${
                          selectedRow?.hcpcs === r.hcpcs
                            ? "bg-blue-50 border-l-2 border-l-blue-500"
                            : i % 2 ? "bg-gray-50/30 hover:bg-blue-50/50" : "hover:bg-blue-50/50"
                        }`}
                      >
                        <td className="px-3 py-2 font-mono font-semibold text-blue-700">{r.hcpcs}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs truncate max-w-[250px]">{r.description}</td>
                        <td className="px-3 py-2 text-center text-xs font-mono">{fmt(r.workRvu)}</td>
                        <td className="px-3 py-2 text-center text-xs font-mono">{fmt(r.nonfacPeRvu)}</td>
                        <td className="px-3 py-2 text-center text-xs font-mono">{fmt(r.facilityPeRvu)}</td>
                        <td className="px-3 py-2 text-center text-xs font-mono">{fmt(r.mpRvu)}</td>
                        <td className="px-3 py-2 text-right text-xs font-mono font-semibold text-green-700">
                          {r.nonfacTotal ? `$${(r.nonfacTotal * CF).toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-mono font-semibold text-teal-700">
                          {r.facilityTotal ? `$${(r.facilityTotal * CF).toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No PFS records found.</td>
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
            </div>
          )}
        </div>

        {/* Detail sidebar */}
        {selectedRow && (
          <div className="lg:col-span-1">
            <div className="border rounded-lg bg-white sticky top-8">
              <div className="bg-blue-50 border-b px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-lg font-bold text-blue-800">{selectedRow.hcpcs}</span>
                  {selectedRow.statusCode && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      selectedRow.statusCode === "A"
                        ? "bg-green-100 text-green-700"
                        : selectedRow.statusCode === "B"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-600"
                    }`}>
                      {STATUS_LABELS[selectedRow.statusCode] || selectedRow.statusCode}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-700">{selectedRow.description}</p>
              </div>

              <div className="p-5 space-y-4">
                {/* RVU breakdown */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">RVU Components</h4>
                  <div className="space-y-2">
                    <RVUBar label="Work" value={selectedRow.workRvu} color="blue" />
                    <RVUBar label="NF Practice Expense" value={selectedRow.nonfacPeRvu} color="green" />
                    <RVUBar label="Fac Practice Expense" value={selectedRow.facilityPeRvu} color="teal" />
                    <RVUBar label="Malpractice" value={selectedRow.mpRvu} color="orange" />
                  </div>
                </div>

                {/* Payment amounts */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Medicare Payment (National)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-50 border border-green-200 rounded p-3 text-center">
                      <div className="text-xs text-green-600 mb-1">Non-Facility</div>
                      <div className="text-lg font-bold text-green-800">
                        {selectedRow.nonfacTotal ? `$${(selectedRow.nonfacTotal * CF).toFixed(2)}` : "—"}
                      </div>
                      <div className="text-[10px] text-green-500 mt-0.5">
                        {fmt(selectedRow.nonfacTotal)} × ${CF}
                      </div>
                    </div>
                    <div className="bg-teal-50 border border-teal-200 rounded p-3 text-center">
                      <div className="text-xs text-teal-600 mb-1">Facility</div>
                      <div className="text-lg font-bold text-teal-800">
                        {selectedRow.facilityTotal ? `$${(selectedRow.facilityTotal * CF).toFixed(2)}` : "—"}
                      </div>
                      <div className="text-[10px] text-teal-500 mt-0.5">
                        {fmt(selectedRow.facilityTotal)} × ${CF}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Formula */}
                <div className="bg-gray-50 rounded p-3">
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">Formula</h4>
                  <p className="text-[10px] text-gray-500 font-mono leading-relaxed">
                    Payment = (Work × PW_GPCI + PE × PE_GPCI + MP × MP_GPCI) × CF
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    National rates shown above use GPCI = 1.0 for all components.
                    Actual payment varies by locality.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-8 bg-gray-50 border rounded-lg p-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Understanding the Fee Schedule</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600">
          <div>
            <strong>RVU (Relative Value Unit):</strong> CMS assigns each CPT code a relative
            value for work, practice expense, and malpractice — reflecting the resources required.
          </div>
          <div>
            <strong>Facility vs Non-Facility:</strong> The same procedure costs more when performed
            in a physician's office (non-facility) because the practice bears overhead costs vs a hospital.
          </div>
          <div>
            <strong>Conversion Factor:</strong> The dollar multiplier applied to total RVUs to get
            the Medicare payment rate. CY 2025 CF = ${CF}. Updated annually by CMS.
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── RVU mini bar chart ── */

function RVUBar({ label, value, color }: { label: string; value: number; color: string }) {
  const maxWidth = 6 // max RVU for bar scale
  const pct = Math.min((value / maxWidth) * 100, 100)
  const colorMap: Record<string, string> = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    teal: "bg-teal-500",
    orange: "bg-orange-500",
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-32 text-right">{label}</span>
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div
          className={`${colorMap[color]} h-2 rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono font-semibold w-10 text-right">{value?.toFixed(2) ?? "—"}</span>
    </div>
  )
}
