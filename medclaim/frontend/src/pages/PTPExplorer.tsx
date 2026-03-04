import { useState, useEffect } from "react"
import { ptpExplorerApi } from "@/lib/api"

/**
 * PTP Explorer — browse and search NCCI Procedure-to-Procedure (PTP) edits.
 *
 * PTP edits define pairs of CPT codes that should not normally be billed
 * together. Column 1 CPT is the comprehensive code; Column 2 is the
 * component code that is bundled into it.
 */

type PTPRow = {
  column1Cpt: string
  column2Cpt: string
  setting: string
  effectiveDate: string | null
  deletionDate: string | null
  modifierInd: string
  rationale: string
  desc1: string | null
  desc2: string | null
}

const MODIFIER_LABELS: Record<string, string> = {
  "0": "Not allowed — modifier won't unbundle",
  "1": "Allowed — modifier 59/XE/XS/XP/XU can unbundle",
  "9": "Not applicable",
}

const SETTING_OPTIONS = [
  { value: "", label: "All Settings" },
  { value: "Practitioner", label: "Practitioner" },
  { value: "Outpatient Hospital", label: "Outpatient Hospital" },
]

export default function PTPExplorer() {
  const [search, setSearch] = useState("")
  const [setting, setSetting] = useState("")
  const [activeOnly, setActiveOnly] = useState(true)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<PTPRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const pageSize = 50

  async function fetchData(pg = 1) {
    setLoading(true)
    try {
      const data = await ptpExplorerApi.browse({
        search: search || undefined,
        setting: setting || undefined,
        activeOnly,
        page: pg,
        pageSize,
      })
      setRows(data.rows)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch { /* ignore */ }
    setLoading(false)
  }

  // Don't auto-fetch on mount — PTP is huge. Require a search.
  const [hasSearched, setHasSearched] = useState(false)

  function handleSearch() {
    if (!search.trim()) return
    setPage(1)
    setHasSearched(true)
    fetchData(1)
  }

  function goPage(pg: number) {
    setPage(pg)
    fetchData(pg)
  }

  return (
    <div className="max-w-7xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">PTP Explorer</h1>
      <p className="text-gray-600 text-sm mb-6">
        Browse NCCI Procedure-to-Procedure (PTP) bundling edits. These define pairs of CPT codes
        that shouldn't be billed together — the comprehensive code (Column 1) already includes
        the component code (Column 2).
      </p>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Enter a CPT code to find its bundles…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          className="flex-1 min-w-[200px] max-w-xs border rounded-lg px-3 py-2 text-sm font-mono"
        />
        <select
          value={setting}
          onChange={e => setSetting(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {SETTING_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={e => setActiveOnly(e.target.checked)}
            className="rounded"
          />
          Active only
        </label>
        <button
          onClick={handleSearch}
          disabled={!search.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          Search
        </button>
        {hasSearched && (
          <div className="text-xs text-gray-500 ml-auto">
            {total.toLocaleString()} result{total !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Pre-search state */}
      {!hasSearched ? (
        <div className="border rounded-lg p-12 text-center text-gray-400 bg-gray-50/50">
          <div className="text-4xl mb-3">🔗</div>
          <p className="text-sm mb-1">Enter a CPT code to search for bundling edits.</p>
          <p className="text-xs text-gray-400">
            The PTP database contains 4.5M+ edit pairs. A CPT code search is required.
          </p>
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 w-24">Col 1 CPT</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 w-24">Col 2 CPT</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 w-36">Setting</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500 w-24">Modifier</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 w-24">Effective</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.column1Cpt}-${r.column2Cpt}-${r.setting}-${i}`} className={`border-t ${i % 2 ? "bg-gray-50/30" : ""}`}>
                    <td className="px-4 py-2 font-mono font-semibold text-blue-700">{r.column1Cpt}</td>
                    <td className="px-4 py-2 text-xs text-gray-600 truncate max-w-[180px]" title={r.desc1 || undefined}>
                      {r.desc1 || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-4 py-2 font-mono font-semibold text-indigo-700">{r.column2Cpt}</td>
                    <td className="px-4 py-2 text-xs text-gray-600 truncate max-w-[180px]" title={r.desc2 || undefined}>
                      {r.desc2 || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{r.setting}</td>
                    <td className="px-4 py-2 text-center">
                      <span
                        className={`inline-block text-xs font-bold rounded px-2 py-0.5 ${
                          r.modifierInd === "0"
                            ? "bg-red-100 text-red-700"
                            : r.modifierInd === "1"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                        title={MODIFIER_LABELS[r.modifierInd] || ""}
                      >
                        {r.modifierInd}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400">{r.effectiveDate || "—"}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                      No PTP edits found for "{search}".
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
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Understanding PTP Edits</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600">
          <div>
            <strong>Column 1 (Comprehensive):</strong> The more inclusive procedure. When both
            are billed, Column 2 is considered already included in Column 1 and should not be
            paid separately.
          </div>
          <div>
            <strong>Modifier Indicator:</strong> <span className="text-red-600 font-semibold">0</span> = modifier
            cannot unbundle; <span className="text-green-600 font-semibold">1</span> = modifier 59 or XE/XS/XP/XU
            can justify separate payment when services are truly distinct.
          </div>
          <div>
            <strong>Setting:</strong> PTP edits are applied separately for Practitioner
            (physician offices, ASCs) and Outpatient Hospital settings. A pair may be bundled
            in one setting but not the other.
          </div>
        </div>
      </div>
    </div>
  )
}
