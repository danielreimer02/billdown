import { useState, useEffect } from "react"
import { mueExplorerApi } from "@/lib/api"

/**
 * MUE Explorer — browse and search NCCI Medically Unlikely Edits.
 *
 * MUE values define the maximum units of a service a provider can
 * report per patient per day. Exceeding the MUE triggers a denial.
 */

type MUERow = {
  cptCode: string
  mueValue: number
  setting: string
  mai: string
  rationale: string
  effectiveDate: string | null
  description: string | null
}

const MAI_LABELS: Record<string, string> = {
  "1": "Line edit — auto-denied",
  "2": "Line edit — auto-denied (policy)",
  "3": "Claim edit — auto-denied for entire claim",
}

const SETTING_OPTIONS = [
  { value: "", label: "All Settings" },
  { value: "Practitioner", label: "Practitioner" },
  { value: "Outpatient Hospital", label: "Outpatient Hospital" },
  { value: "DME", label: "DME" },
]

export default function MUEExplorer() {
  const [search, setSearch] = useState("")
  const [setting, setSetting] = useState("")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<MUERow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const pageSize = 50

  async function fetchData(pg = 1) {
    setLoading(true)
    try {
      const data = await mueExplorerApi.browse({
        search: search || undefined,
        setting: setting || undefined,
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
    fetchData(1)
  }

  function goPage(pg: number) {
    setPage(pg)
    fetchData(pg)
  }

  return (
    <div className="max-w-7xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">MUE Explorer</h1>
      <p className="text-gray-600 text-sm mb-6">
        Browse Medically Unlikely Edits (MUEs). These define the maximum units of a CPT code
        a provider can bill per patient per day. Exceeding the MUE triggers automatic denials.
      </p>

      {/* Search + filters */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by CPT code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          className="flex-1 max-w-xs border rounded-lg px-3 py-2 text-sm font-mono"
        />
        <select
          value={setting}
          onChange={e => { setSetting(e.target.value); setPage(1); setTimeout(() => fetchData(1), 0) }}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {SETTING_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
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

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 w-24">CPT</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Description</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500 w-20">Max Units</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 w-40">Setting</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 w-48">MAI</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 w-24">Effective</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.cptCode}-${r.setting}-${i}`} className={`border-t ${i % 2 ? "bg-gray-50/30" : ""}`}>
                    <td className="px-4 py-2 font-mono font-semibold text-blue-700">{r.cptCode}</td>
                    <td className="px-4 py-2 text-gray-600 text-xs">
                      {r.description || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-block font-bold rounded px-2 py-0.5 text-xs ${
                        r.mueValue <= 1
                          ? "bg-red-100 text-red-700"
                          : r.mueValue <= 3
                            ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                      }`}>
                        {r.mueValue}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{r.setting}</td>
                    <td className="px-4 py-2 text-xs text-gray-500" title={MAI_LABELS[r.mai] || r.mai}>
                      {r.mai ? `MAI ${r.mai}` : "—"}
                      {r.mai && MAI_LABELS[r.mai] && (
                        <span className="text-gray-400 ml-1">— {MAI_LABELS[r.mai]}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400">{r.effectiveDate || "—"}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">No MUE records found.</td>
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

      {/* Legend */}
      <div className="mt-8 bg-gray-50 border rounded-lg p-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Understanding MUE Values</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600">
          <div>
            <strong>MUE Value:</strong> Maximum units of service a provider can report
            per beneficiary per day. Claims exceeding this trigger automatic edits.
          </div>
          <div>
            <strong>MAI (MUE Adjudication Indicator):</strong> Determines how the edit
            is applied. MAI 1 & 2 = per-line edits. MAI 3 = per-claim (all lines summed).
          </div>
          <div>
            <strong>Setting:</strong> MUE values differ by place of service — Practitioner
            (office/ASC), Outpatient Hospital, and DME may each have different limits.
          </div>
        </div>
      </div>
    </div>
  )
}
