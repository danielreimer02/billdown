import { useState, useEffect } from "react"
import { lcdExplorerApi } from "@/lib/api"

/**
 * LCD Explorer — browse and search Local Coverage Determinations and Articles.
 *
 * Two tabs: LCDs and Articles.
 * Clicking an LCD or Article opens a detail panel showing linked entities,
 * CPT codes, ICD-10 mappings, and jurisdiction info.
 */

/* ── types ── */

type LCDRow = {
  lcdId: number; version: number; title: string; status: string
  displayId: string; determinationNumber: string; lastUpdated: string | null
}

type ArticleRow = {
  articleId: number; version: number; title: string; status: string; lastUpdated: string | null
}

type LCDDetail = {
  lcd: LCDRow
  articles: Array<{ articleId: number; version: number; title: string; status: string }>
  cptCodes: Array<{ cptCode: string; shortDescription: string; longDescription: string; articleId: number }>
  states: Array<{ abbrev: string; name: string }>
}

type ArticleDetail = {
  article: ArticleRow
  cptCodes: Array<{ cptCode: string; shortDescription: string; longDescription: string }>
  coveredCodes: Array<{ icd10Code: string; group: number; description: string }>
  coveredGroups: Array<{ group: number; paragraph: string }>
  noncoveredCodes: Array<{ icd10Code: string; group: number; description: string }>
  linkedLcds: Array<{ lcdId: number; title: string; status: string }>
}

/* ── helpers ── */

function stripHtml(html: string): string {
  const div = document.createElement("div")
  div.innerHTML = html
  return div.textContent || div.innerText || ""
}

/* ── component ── */

export default function LCDExplorer() {
  const [tab, setTab] = useState<"lcds" | "articles">("lcds")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const pageSize = 50

  // LCD list
  const [lcds, setLcds] = useState<LCDRow[]>([])
  const [lcdTotal, setLcdTotal] = useState(0)
  const [lcdPages, setLcdPages] = useState(0)
  const [lcdLoading, setLcdLoading] = useState(false)

  // Article list
  const [articles, setArticles] = useState<ArticleRow[]>([])
  const [artTotal, setArtTotal] = useState(0)
  const [artPages, setArtPages] = useState(0)
  const [artLoading, setArtLoading] = useState(false)

  // Detail panels
  const [lcdDetail, setLcdDetail] = useState<LCDDetail | null>(null)
  const [artDetail, setArtDetail] = useState<ArticleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // ICD-10 search filter in article detail
  const [icdFilter, setIcdFilter] = useState("")

  /* ── fetch lists ── */

  async function fetchLcds(pg = 1) {
    setLcdLoading(true)
    try {
      const data = await lcdExplorerApi.lcds({ search: search || undefined, page: pg, pageSize })
      setLcds(data.lcds)
      setLcdTotal(data.total)
      setLcdPages(data.totalPages)
    } catch { /* ignore */ }
    setLcdLoading(false)
  }

  async function fetchArticles(pg = 1) {
    setArtLoading(true)
    try {
      const data = await lcdExplorerApi.articles({ search: search || undefined, page: pg, pageSize })
      setArticles(data.articles)
      setArtTotal(data.total)
      setArtPages(data.totalPages)
    } catch { /* ignore */ }
    setArtLoading(false)
  }

  // Load on mount and tab change
  useEffect(() => {
    setPage(1)
    setLcdDetail(null)
    setArtDetail(null)
    if (tab === "lcds") fetchLcds(1)
    else fetchArticles(1)
  }, [tab])

  function handleSearch() {
    setPage(1)
    setLcdDetail(null)
    setArtDetail(null)
    if (tab === "lcds") fetchLcds(1)
    else fetchArticles(1)
  }

  function goPage(pg: number) {
    setPage(pg)
    setLcdDetail(null)
    setArtDetail(null)
    if (tab === "lcds") fetchLcds(pg)
    else fetchArticles(pg)
  }

  /* ── detail loaders ── */

  async function openLcd(lcdId: number) {
    setDetailLoading(true)
    setArtDetail(null)
    setIcdFilter("")
    try {
      const data = await lcdExplorerApi.lcdDetail(lcdId)
      setLcdDetail(data)
    } catch { setLcdDetail(null) }
    setDetailLoading(false)
  }

  async function openArticle(articleId: number) {
    setDetailLoading(true)
    setLcdDetail(null)
    setIcdFilter("")
    try {
      const data = await lcdExplorerApi.articleDetail(articleId)
      setArtDetail(data)
    } catch { setArtDetail(null) }
    setDetailLoading(false)
  }

  /* ── computed ── */
  const totalPages = tab === "lcds" ? lcdPages : artPages
  const total = tab === "lcds" ? lcdTotal : artTotal
  const listLoading = tab === "lcds" ? lcdLoading : artLoading

  const filteredCovered = artDetail
    ? icdFilter
      ? artDetail.coveredCodes.filter(
          c => c.icd10Code.includes(icdFilter.toUpperCase()) ||
               (c.description || "").toLowerCase().includes(icdFilter.toLowerCase())
        )
      : artDetail.coveredCodes
    : []

  const filteredNoncovered = artDetail
    ? icdFilter
      ? artDetail.noncoveredCodes.filter(
          c => c.icd10Code.includes(icdFilter.toUpperCase()) ||
               (c.description || "").toLowerCase().includes(icdFilter.toLowerCase())
        )
      : artDetail.noncoveredCodes
    : []

  /* ── render ── */

  return (
    <div className="max-w-7xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">LCD Explorer</h1>
      <p className="text-gray-600 text-sm mb-6">
        Browse and search Local Coverage Determinations (LCDs) and their companion Articles.
        Click any item to see full details including CPT codes, ICD-10 mappings, and state jurisdictions.
      </p>

      {/* Tab bar + search */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab("lcds")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === "lcds"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            LCDs
          </button>
          <button
            onClick={() => setTab("articles")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === "articles"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Articles
          </button>
        </div>

        <div className="flex-1 flex gap-2">
          <input
            type="text"
            placeholder={tab === "lcds" ? "Search by LCD ID or title…" : "Search by article ID or title…"}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={handleSearch}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Search
          </button>
        </div>

        <div className="text-xs text-gray-500">
          {total.toLocaleString()} result{total !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Content: list + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── List panel (2/5 width) ── */}
        <div className="lg:col-span-2">
          {listLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
          ) : tab === "lcds" ? (
            <div className="space-y-1">
              {lcds.map(lcd => (
                <button
                  key={lcd.lcdId}
                  onClick={() => openLcd(lcd.lcdId)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all hover:border-blue-300 hover:bg-blue-50/50 ${
                    lcdDetail?.lcd.lcdId === lcd.lcdId
                      ? "border-blue-400 bg-blue-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs font-bold text-blue-700">
                      LCD-{lcd.lcdId}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      lcd.status === "Future"
                        ? "bg-green-100 text-green-700"
                        : lcd.status === "Retired"
                          ? "bg-gray-100 text-gray-500"
                          : "bg-blue-100 text-blue-700"
                    }`}>
                      {lcd.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 line-clamp-2">{lcd.title}</p>
                </button>
              ))}
              {lcds.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">
                  No LCDs found.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {articles.map(art => (
                <button
                  key={art.articleId}
                  onClick={() => openArticle(art.articleId)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all hover:border-blue-300 hover:bg-blue-50/50 ${
                    artDetail?.article.articleId === art.articleId
                      ? "border-blue-400 bg-blue-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs font-bold text-indigo-700">
                      ART-{art.articleId}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      art.status === "Future"
                        ? "bg-green-100 text-green-700"
                        : art.status === "Retired"
                          ? "bg-gray-100 text-gray-500"
                          : "bg-blue-100 text-blue-700"
                    }`}>
                      {art.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 line-clamp-2">{art.title}</p>
                </button>
              ))}
              {articles.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">
                  No articles found.
                </div>
              )}
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
            </div>
          )}
        </div>

        {/* ── Detail panel (3/5 width) ── */}
        <div className="lg:col-span-3">
          {detailLoading ? (
            <div className="border rounded-lg p-12 text-center text-gray-400 text-sm">
              Loading details…
            </div>
          ) : lcdDetail ? (
            /* ── LCD Detail ── */
            <div className="border rounded-lg bg-white overflow-hidden">
              {/* Header */}
              <div className="bg-blue-50 border-b px-6 py-4">
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-lg font-bold text-blue-900">LCD-{lcdDetail.lcd.lcdId}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    lcdDetail.lcd.status === "Future"
                      ? "bg-green-200 text-green-800"
                      : "bg-blue-200 text-blue-800"
                  }`}>
                    {lcdDetail.lcd.status}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{lcdDetail.lcd.title}</p>
                {lcdDetail.lcd.displayId && (
                  <p className="text-xs text-gray-500 mt-1">
                    Display ID: {lcdDetail.lcd.displayId}
                    {lcdDetail.lcd.lastUpdated && ` · Updated: ${lcdDetail.lcd.lastUpdated.split("T")[0]}`}
                  </p>
                )}
              </div>

              <div className="p-6 space-y-5">
                {/* States */}
                {lcdDetail.states.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Jurisdictions</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {lcdDetail.states.map(s => (
                        <span key={s.abbrev} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-medium" title={s.name}>
                          {s.abbrev}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Linked articles */}
                {lcdDetail.articles.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Linked Articles</h3>
                    <div className="space-y-1">
                      {lcdDetail.articles.map(a => (
                        <button
                          key={a.articleId}
                          onClick={() => { setTab("articles"); openArticle(a.articleId) }}
                          className="block w-full text-left px-3 py-2 bg-indigo-50 border border-indigo-200 rounded text-xs hover:bg-indigo-100 transition-colors"
                        >
                          <span className="font-mono font-bold text-indigo-700">ART-{a.articleId}</span>
                          <span className="text-gray-600 ml-2">{a.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* CPT codes */}
                {lcdDetail.cptCodes.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                      CPT / HCPCS Codes ({lcdDetail.cptCodes.length})
                    </h3>
                    <div className="max-h-[300px] overflow-y-auto border rounded">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-500">Code</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lcdDetail.cptCodes.map((c, i) => (
                            <tr key={`${c.cptCode}-${i}`} className={`border-t ${i % 2 ? "bg-gray-50/30" : ""}`}>
                              <td className="px-3 py-1.5 font-mono font-semibold text-teal-700">{c.cptCode}</td>
                              <td className="px-3 py-1.5 text-gray-600">{c.shortDescription || c.longDescription}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : artDetail ? (
            /* ── Article Detail ── */
            <div className="border rounded-lg bg-white overflow-hidden">
              {/* Header */}
              <div className="bg-indigo-50 border-b px-6 py-4">
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-lg font-bold text-indigo-900">Article-{artDetail.article.articleId}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    artDetail.article.status === "Future"
                      ? "bg-green-200 text-green-800"
                      : "bg-indigo-200 text-indigo-800"
                  }`}>
                    {artDetail.article.status}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{artDetail.article.title}</p>
                {artDetail.article.lastUpdated && (
                  <p className="text-xs text-gray-500 mt-1">
                    Updated: {artDetail.article.lastUpdated.split("T")[0]}
                  </p>
                )}
              </div>

              <div className="p-6 space-y-5">
                {/* Linked LCDs */}
                {artDetail.linkedLcds.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Linked LCDs</h3>
                    <div className="space-y-1">
                      {artDetail.linkedLcds.map(l => (
                        <button
                          key={l.lcdId}
                          onClick={() => { setTab("lcds"); openLcd(l.lcdId) }}
                          className="block w-full text-left px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs hover:bg-blue-100 transition-colors"
                        >
                          <span className="font-mono font-bold text-blue-700">LCD-{l.lcdId}</span>
                          <span className="text-gray-600 ml-2">{l.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* CPT codes */}
                {artDetail.cptCodes.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                      CPT / HCPCS Codes ({artDetail.cptCodes.length})
                    </h3>
                    <div className="max-h-[200px] overflow-y-auto border rounded">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-500 w-24">Code</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {artDetail.cptCodes.map((c, i) => (
                            <tr key={`${c.cptCode}-${i}`} className={`border-t ${i % 2 ? "bg-gray-50/30" : ""}`}>
                              <td className="px-3 py-1.5 font-mono font-semibold text-teal-700">{c.cptCode}</td>
                              <td className="px-3 py-1.5 text-gray-600">{c.shortDescription || c.longDescription}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Group rules */}
                {artDetail.coveredGroups.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Coverage Group Rules</h3>
                    <div className="space-y-2">
                      {artDetail.coveredGroups.map(g => (
                        <div key={g.group} className="bg-green-50 border border-green-200 rounded px-3 py-2">
                          <div className="text-xs font-semibold text-green-800 mb-1">Group {g.group}</div>
                          <p className="text-xs text-green-700 leading-relaxed">
                            {stripHtml(g.paragraph).slice(0, 300)}
                            {stripHtml(g.paragraph).length > 300 ? "…" : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ICD-10 filter */}
                {(artDetail.coveredCodes.length > 0 || artDetail.noncoveredCodes.length > 0) && (
                  <div>
                    <input
                      type="text"
                      placeholder="Filter ICD-10 codes…"
                      value={icdFilter}
                      onChange={e => setIcdFilter(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-xs mb-3"
                    />
                  </div>
                )}

                {/* Covered ICD-10 */}
                {filteredCovered.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                      ✓ Covered ICD-10 Codes ({filteredCovered.length}{icdFilter ? ` of ${artDetail?.coveredCodes.length}` : ""})
                    </h3>
                    <div className="max-h-[300px] overflow-y-auto border rounded">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-green-50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-500 w-24">Code</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-500 w-16">Group</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCovered.map((c, i) => (
                            <tr key={`${c.icd10Code}-${c.group}-${i}`} className={`border-t ${i % 2 ? "bg-gray-50/30" : ""}`}>
                              <td className="px-3 py-1.5 font-mono font-semibold text-green-700">{c.icd10Code}</td>
                              <td className="px-3 py-1.5 text-gray-500">{c.group}</td>
                              <td className="px-3 py-1.5 text-gray-600">{c.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Noncovered ICD-10 */}
                {filteredNoncovered.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                      ✗ Noncovered ICD-10 Codes ({filteredNoncovered.length}{icdFilter ? ` of ${artDetail?.noncoveredCodes.length}` : ""})
                    </h3>
                    <div className="max-h-[200px] overflow-y-auto border rounded">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-red-50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-500 w-24">Code</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-500 w-16">Group</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredNoncovered.map((c, i) => (
                            <tr key={`${c.icd10Code}-${c.group}-${i}`} className={`border-t ${i % 2 ? "bg-gray-50/30" : ""}`}>
                              <td className="px-3 py-1.5 font-mono font-semibold text-red-700">{c.icd10Code}</td>
                              <td className="px-3 py-1.5 text-gray-500">{c.group}</td>
                              <td className="px-3 py-1.5 text-gray-600">{c.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── Empty state ── */
            <div className="border rounded-lg p-12 text-center text-gray-400 bg-gray-50/50">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-sm">
                Select an {tab === "lcds" ? "LCD" : "article"} from the list to view its details.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
