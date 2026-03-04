import { useState, useEffect } from "react"
import { icd10ExplorerApi } from "@/lib/api"

/**
 * ICD-10 Explorer — browse and search all ICD-10 diagnosis codes.
 *
 * Features:
 * - Chapter-letter sidebar for quick navigation (A–Z)
 * - Full-text search by code or description
 * - Paginated table with 100 codes per page
 * - Color-coded chapter badges
 */

type ICD10Row = { code: string; description: string | null }
type Chapter = { letter: string; count: number }

const CHAPTER_NAMES: Record<string, string> = {
  A: "Infectious & Parasitic",
  B: "Infectious & Parasitic",
  C: "Neoplasms",
  D: "Blood / Neoplasms",
  E: "Endocrine / Metabolic",
  F: "Mental & Behavioral",
  G: "Nervous System",
  H: "Eye & Ear",
  I: "Circulatory System",
  J: "Respiratory System",
  K: "Digestive System",
  L: "Skin & Subcutaneous",
  M: "Musculoskeletal",
  N: "Genitourinary System",
  O: "Pregnancy / Childbirth",
  P: "Perinatal Conditions",
  Q: "Congenital Anomalies",
  R: "Symptoms / Signs",
  S: "Injury (specific body)",
  T: "Injury (poisoning / other)",
  U: "Special Purpose",
  V: "External Causes (transport)",
  W: "External Causes (other)",
  X: "External Causes (other)",
  Y: "External Causes (other)",
  Z: "Factors Influencing Health",
}

const CHAPTER_COLORS: Record<string, string> = {
  A: "bg-red-100 text-red-700",
  B: "bg-red-100 text-red-700",
  C: "bg-purple-100 text-purple-700",
  D: "bg-purple-100 text-purple-700",
  E: "bg-amber-100 text-amber-700",
  F: "bg-pink-100 text-pink-700",
  G: "bg-indigo-100 text-indigo-700",
  H: "bg-cyan-100 text-cyan-700",
  I: "bg-rose-100 text-rose-700",
  J: "bg-sky-100 text-sky-700",
  K: "bg-orange-100 text-orange-700",
  L: "bg-lime-100 text-lime-700",
  M: "bg-blue-100 text-blue-700",
  N: "bg-teal-100 text-teal-700",
  O: "bg-fuchsia-100 text-fuchsia-700",
  P: "bg-violet-100 text-violet-700",
  Q: "bg-emerald-100 text-emerald-700",
  R: "bg-yellow-100 text-yellow-700",
  S: "bg-red-100 text-red-800",
  T: "bg-red-100 text-red-800",
  U: "bg-gray-100 text-gray-600",
  V: "bg-stone-100 text-stone-700",
  W: "bg-stone-100 text-stone-700",
  X: "bg-stone-100 text-stone-700",
  Y: "bg-stone-100 text-stone-700",
  Z: "bg-green-100 text-green-700",
}

export default function ICD10Explorer() {
  const [search, setSearch] = useState("")
  const [chapter, setChapter] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ICD10Row[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const pageSize = 100

  async function fetchData(pg = 1, ch = chapter, srch = search) {
    setLoading(true)
    try {
      const data = await icd10ExplorerApi.browse({
        search: srch || undefined,
        chapter: ch || undefined,
        page: pg,
        pageSize,
      })
      setRows(data.rows)
      setTotal(data.total)
      setTotalPages(data.totalPages)
      if (data.chapters?.length) setChapters(data.chapters)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetchData(1, null, "") }, [])

  function handleSearch() {
    setPage(1)
    setChapter(null)
    fetchData(1, null, search)
  }

  function selectChapter(ch: string | null) {
    setChapter(ch)
    setSearch("")
    setPage(1)
    fetchData(1, ch, "")
  }

  function goPage(pg: number) {
    setPage(pg)
    fetchData(pg)
  }

  return (
    <div className="max-w-7xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-1">ICD-10 Explorer</h1>
      <p className="text-gray-600 text-sm mb-6">
        Browse {total > 0 ? total.toLocaleString() : "58,000+"} ICD-10 diagnosis codes from the CMS LCD database.
        Navigate by chapter or search by code and description.
      </p>

      {/* Search bar */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by code or description (e.g. M17.11, knee, diabetes)…"
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
        {chapter && (
          <button
            onClick={() => selectChapter(null)}
            className="text-xs text-blue-600 hover:underline"
          >
            Clear chapter filter
          </button>
        )}
        <div className="text-xs text-gray-500 ml-auto">
          {total.toLocaleString()} code{total !== 1 ? "s" : ""}
          {chapter && ` in Chapter ${chapter}`}
        </div>
      </div>

      <div className="flex gap-6">
        {/* ── Chapter sidebar ── */}
        <div className="w-48 shrink-0 hidden md:block">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Chapters</h3>
          <div className="space-y-0.5 max-h-[calc(100vh-200px)] overflow-y-auto">
            <button
              onClick={() => selectChapter(null)}
              className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors ${
                !chapter ? "bg-blue-100 text-blue-800 font-semibold" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              All Codes
            </button>
            {chapters.map(ch => (
              <button
                key={ch.letter}
                onClick={() => selectChapter(ch.letter)}
                className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${
                  chapter === ch.letter
                    ? "bg-blue-100 text-blue-800 font-semibold"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span>
                  <span className={`inline-block w-5 h-5 text-center rounded text-[10px] font-bold leading-5 mr-2 ${
                    CHAPTER_COLORS[ch.letter] || "bg-gray-100 text-gray-600"
                  }`}>
                    {ch.letter}
                  </span>
                  <span className="truncate">{CHAPTER_NAMES[ch.letter] || ch.letter}</span>
                </span>
                <span className="text-gray-400 font-mono text-[10px]">{ch.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Mobile chapter pills ── */}
        <div className="md:hidden mb-4 flex flex-wrap gap-1">
          {chapters.map(ch => (
            <button
              key={ch.letter}
              onClick={() => selectChapter(ch.letter)}
              className={`px-2 py-1 rounded text-xs font-bold ${
                chapter === ch.letter
                  ? "bg-blue-600 text-white"
                  : CHAPTER_COLORS[ch.letter] || "bg-gray-100 text-gray-600"
              }`}
            >
              {ch.letter}
            </button>
          ))}
        </div>

        {/* ── Table ── */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 w-32">Code</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const ch = r.code.charAt(0)
                      return (
                        <tr key={`${r.code}-${i}`} className={`border-t ${i % 2 ? "bg-gray-50/30" : ""}`}>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-5 h-5 text-center rounded text-[10px] font-bold leading-5 shrink-0 ${
                                CHAPTER_COLORS[ch] || "bg-gray-100 text-gray-600"
                              }`}>
                                {ch}
                              </span>
                              <span className="font-mono font-semibold text-blue-700">{r.code}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-gray-600 text-xs">
                            {r.description || <span className="text-gray-300 italic">No description available</span>}
                          </td>
                        </tr>
                      )
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={2} className="text-center py-12 text-gray-400 text-sm">
                          No ICD-10 codes found.
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
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages}
              </span>
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
      </div>
    </div>
  )
}
