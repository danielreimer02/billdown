import { useState } from "react"
import { lcdApi, billingApi } from "@/lib/api"
import type { LCDCoverage } from "@/types"

/**
 * LCD Lookup page — two-column layout.
 *
 * Left column:  Coverage Check — CPT + ICD-10 + state → covered/not covered
 * Right column: Physician Helper — CPT + state → all required ICD-10s
 *
 * This powers BOTH products:
 * - Patient: "was my denial wrongful?"
 * - Physician: "what do I need to document?"
 */

/* ── types ─────────────────────────────────────────── */

type CoveredCodesResult = {
  cptCode: string
  state: string
  lcdId: string | null
  lcdTitle: string | null
  articleId: string | null
  articleTitle: string | null
  groups: Array<{
    groupNum: number
    ruleType: "standalone" | "combination" | "informational"
    requiresGroups: number[]
    paragraph: string
    codes: Array<{ code: string; description: string }>
  }>
  standaloneCodes: Array<{ code: string; description: string }>
  combinationGroups: Array<{
    groupNum: number
    ruleType: string
    requiresGroups: number[]
    paragraph: string
    codes: Array<{ code: string; description: string }>
  }>
  noncoveredCodes: Array<{ code: string; description: string }>
  xx000Message: string | null
  message: string
}

type ReverseLookupCPT = {
  cptCode: string
  lcdId: string | null
  lcdTitle: string | null
  articleId: string | null
  articleTitle: string | null
  standalone: boolean
  groupNum: number
  ruleType: string
  requiresGroups: number[]
}

/* ── component ─────────────────────────────────────── */

export default function LCDLookup() {
  /* left column — coverage check */
  const [cptCode, setCptCode]     = useState("")
  const [icd10Code, setIcd10Code] = useState("")
  const [state, setState]         = useState("")
  const [result, setResult]       = useState<(LCDCoverage & { message: string }) | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  /* right column — physician helper */
  const [phCpt, setPhCpt]           = useState("")
  const [phState, setPhState]       = useState("")
  const [phResult, setPhResult]     = useState<CoveredCodesResult | null>(null)
  const [phLoading, setPhLoading]   = useState(false)
  const [phError, setPhError]       = useState<string | null>(null)
  const [phFilter, setPhFilter]     = useState("")
  const [phTab, setPhTab]           = useState<"standalone" | "combinations" | "noncovered">("standalone")

  /* right column — reverse lookup (ICD-10 → CPTs) */
  const [rvIcd, setRvIcd]           = useState("")
  const [rvState, setRvState]       = useState("")
  const [rvResult, setRvResult]     = useState<{
    icd10Code: string
    state: string
    cpts: ReverseLookupCPT[]
    message: string
  } | null>(null)
  const [rvLoading, setRvLoading]   = useState(false)
  const [rvError, setRvError]       = useState<string | null>(null)
  const [rvFilter, setRvFilter]     = useState("")

  /* ── PTP (NCCI bundling) checker ── */
  const [ptpCpt1, setPtpCpt1]       = useState("")
  const [ptpCpt2, setPtpCpt2]       = useState("")
  const [ptpResult, setPtpResult]   = useState<{
    cpt1: string; cpt2: string; bundled: boolean
    flags: Array<{ cpt1: string; cpt2: string; setting: string; modifierInd: string; rationale: string; detail: string }>
    message: string
  } | null>(null)
  const [ptpLoading, setPtpLoading] = useState(false)
  const [ptpError, setPtpError]     = useState<string | null>(null)

  /* ── MUE checker ── */
  const [mueCpt, setMueCpt]         = useState("")
  const [mueResult, setMueResult]   = useState<{
    cptCode: string
    limits: Array<{ cptCode: string; mueValue: number; setting: string; mai: string; rationale: string }>
    message: string
  } | null>(null)
  const [mueLoading, setMueLoading] = useState(false)
  const [mueError, setMueError]     = useState<string | null>(null)

  /* ── PFS rate checker ── */
  const [pfsCpt, setPfsCpt]         = useState("")
  const [pfsState, setPfsState]     = useState("")
  const [pfsLocality, setPfsLocality] = useState("")
  const [pfsLocalities, setPfsLocalities] = useState<Array<{
    localityNumber: string; localityName: string; counties: string
    pwGpci: number; peGpci: number; mpGpci: number
  }>>([])
  const [pfsSetting, setPfsSetting] = useState<"nonfacility" | "facility">("nonfacility")
  const [pfsResult, setPfsResult]   = useState<{
    cptCode: string
    rate: {
      cptCode: string; description: string; payment: number
      workRvu?: number; peRvu?: number; mpRvu?: number; totalRvu?: number
      gpci?: { pw: number; pe: number; mp: number }; locality?: string
      convFactor: number; source: string
    } | null
    message: string
  } | null>(null)
  const [pfsLoading, setPfsLoading] = useState(false)
  const [pfsError, setPfsError]     = useState<string | null>(null)

  /* ── handlers ──────────────────────────────────── */

  async function handleLookup() {
    if (!cptCode || !icd10Code || !state) return
    setLoading(true); setError(null); setResult(null)
    try {
      const data = await lcdApi.lookup({ cptCode, icd10Code, state })
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed")
    } finally {
      setLoading(false)
    }
  }

  async function handlePhysicianLookup() {
    if (!phCpt || !phState) return
    setPhLoading(true); setPhError(null); setPhResult(null)
    try {
      const data = await lcdApi.coveredCodes({ cptCode: phCpt, state: phState })
      setPhResult(data)
    } catch (err) {
      setPhError(err instanceof Error ? err.message : "Lookup failed")
    } finally {
      setPhLoading(false)
    }
  }

  async function handleReverseLookup() {
    if (!rvIcd || !rvState) return
    setRvLoading(true); setRvError(null); setRvResult(null)
    try {
      const data = await lcdApi.cptsForDiagnosis({ icd10Code: rvIcd, state: rvState })
      setRvResult(data)
    } catch (err) {
      setRvError(err instanceof Error ? err.message : "Lookup failed")
    } finally {
      setRvLoading(false)
    }
  }

  async function handlePtpCheck() {
    if (!ptpCpt1 || !ptpCpt2) return
    setPtpLoading(true); setPtpError(null); setPtpResult(null)
    try {
      const data = await billingApi.ncciCheckPair(ptpCpt1, ptpCpt2)
      setPtpResult(data)
    } catch (err) {
      setPtpError(err instanceof Error ? err.message : "Check failed")
    } finally {
      setPtpLoading(false)
    }
  }

  async function handleMueCheck() {
    if (!mueCpt) return
    setMueLoading(true); setMueError(null); setMueResult(null)
    try {
      const data = await billingApi.mueCheck(mueCpt)
      setMueResult(data)
    } catch (err) {
      setMueError(err instanceof Error ? err.message : "Check failed")
    } finally {
      setMueLoading(false)
    }
  }

  async function handlePfsStateChange(newState: string) {
    const s = newState.trim().toUpperCase()
    setPfsState(s)
    setPfsLocality("")
    setPfsLocalities([])
    if (s.length === 2) {
      try {
        const data = await billingApi.pfsLocalities(s)
        setPfsLocalities(data.localities)
      } catch { /* ignore */ }
    }
  }

  async function handlePfsCheck() {
    if (!pfsCpt) return
    setPfsLoading(true); setPfsError(null); setPfsResult(null)
    try {
      const data = await billingApi.pfsRate(
        pfsCpt,
        pfsState || undefined,
        pfsLocality || undefined,
        pfsSetting,
      )
      setPfsResult(data)
    } catch (err) {
      setPfsError(err instanceof Error ? err.message : "Check failed")
    } finally {
      setPfsLoading(false)
    }
  }

  /* filtered codes for physician helper */
  const filteredStandalone = phResult?.standaloneCodes.filter(
    (c: { code: string; description: string }) => !phFilter || c.code.includes(phFilter.toUpperCase()) || c.description.toLowerCase().includes(phFilter.toLowerCase())
  ) ?? []
  const filteredNoncovered = phResult?.noncoveredCodes.filter(
    (c: { code: string; description: string }) => !phFilter || c.code.includes(phFilter.toUpperCase()) || c.description.toLowerCase().includes(phFilter.toLowerCase())
  ) ?? []

  const totalCoveredCount = phResult?.groups.reduce((sum, g) => sum + g.codes.length, 0) ?? 0

  const filteredCpts = rvResult?.cpts.filter(
    c => !rvFilter || c.cptCode.includes(rvFilter) || (c.lcdTitle?.toLowerCase().includes(rvFilter.toLowerCase()) ?? false)
  ) ?? []

  /* ── render ────────────────────────────────────── */

  return (
    <div className="max-w-7xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">LCD Coverage Lookup</h1>
      <p className="text-gray-600 mb-8">
        Check coverage, find required diagnoses, and build your case.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ─────────────── LEFT COLUMN: Coverage Check ─────────────── */}
        <div>
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
              🔍 Coverage Check
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Is this CPT + ICD-10 covered in your state?
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">CPT Code</label>
                <input
                  type="text"
                  placeholder="e.g. 27447"
                  value={cptCode}
                  onChange={e => setCptCode(e.target.value.trim())}
                  className="w-full border rounded px-3 py-2 font-mono text-sm"
                  maxLength={5}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ICD-10 Code</label>
                <input
                  type="text"
                  placeholder="e.g. M17.11"
                  value={icd10Code}
                  onChange={e => setIcd10Code(e.target.value.trim().toUpperCase())}
                  className="w-full border rounded px-3 py-2 font-mono text-sm"
                  maxLength={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">State</label>
                <input
                  type="text"
                  placeholder="e.g. TX"
                  value={state}
                  onChange={e => setState(e.target.value.trim().toUpperCase())}
                  className="w-full border rounded px-3 py-2 text-sm"
                  maxLength={2}
                />
              </div>
              <button
                onClick={handleLookup}
                disabled={loading || !cptCode || !icd10Code || !state}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded text-sm font-medium
                           hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Looking up…" : "Check Coverage"}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700 text-sm mb-4">
              {error}
            </div>
          )}

          {/* Coverage Result */}
          {result && (
            <div className={`border rounded-lg p-5 space-y-4 ${
              result.covered ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
            }`}>
              <div className="flex items-center gap-3">
                <span className={`text-2xl font-bold ${
                  result.covered ? "text-green-700" : "text-red-700"
                }`}>
                  {result.covered ? "✓ Covered" : "✗ Not Covered"}
                </span>
              </div>

              <p className="text-gray-700 text-sm">{result.message}</p>

              {result.medicareRate && (
                <div className="bg-white rounded p-3 border text-sm">
                  <span className="text-gray-500">Medicare rate: </span>
                  <span className="font-semibold">${result.medicareRate.toFixed(2)}</span>
                </div>
              )}

              {result.lcdId && (
                <div className="text-xs text-gray-600">
                  LCD: <span className="font-mono">{result.lcdId}</span>
                  {result.title && ` — ${result.title}`}
                </div>
              )}

              {result.articleId && (
                <div className="text-xs text-gray-600">
                  Article: <span className="font-mono">{result.articleId}</span>
                  {result.articleTitle && ` — ${result.articleTitle}`}
                </div>
              )}

              {result.icd10Description && (
                <div className="text-xs text-gray-600">
                  Diagnosis: <span className="font-mono">{result.icd10Code}</span> — {result.icd10Description}
                </div>
              )}

              {/* Covered ICD-10 samples */}
              {result.coveredIcd10Codes && result.coveredIcd10Codes.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2">
                    {result.covered
                      ? "Other Covered Diagnoses"
                      : "Diagnoses That ARE Covered"}
                  </h3>
                  <p className="text-xs text-gray-600 mb-2">
                    {result.covered
                      ? "This CPT is also covered with these ICD-10 codes:"
                      : "Your diagnosis wasn't covered, but these are — useful for appeals:"}
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {result.coveredIcd10Codes.map((item: any, i: number) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded px-2 py-0.5 text-xs font-mono"
                        title={item.description || item}
                      >
                        {typeof item === "string" ? item : item.code}
                        {typeof item === "object" && item.description && (
                          <span className="font-sans text-gray-400 max-w-[160px] truncate">
                            {item.description}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Documentation Criteria */}
              {result.documentationCriteria.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2">Required Documentation</h3>
                  <p className="text-xs text-gray-600 mb-2">
                    Insurance can only deny this if your chart is missing one of these:
                  </p>
                  <ul className="space-y-1.5">
                    {result.documentationCriteria.map((criterion, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <input type="checkbox" className="mt-0.5" id={`criterion-${i}`} />
                        <label htmlFor={`criterion-${i}`} className="text-xs">
                          {criterion}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.covered && (
                <div className="pt-3 border-t border-green-200">
                  <p className="text-xs font-medium text-green-800 mb-2">
                    This procedure is covered. If denied, we can write your appeal letter citing LCD {result.lcdId}.
                  </p>
                  <button className="bg-green-700 text-white px-4 py-1.5 rounded text-xs hover:bg-green-800">
                    Generate Appeal Letter
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─────────────── RIGHT COLUMN: Physician Helper ─────────────── */}
        <div>
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
              🩺 Physician Helper
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Enter a CPT + state to get all accepted &amp; rejected ICD-10 codes.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">CPT Code</label>
                <input
                  type="text"
                  placeholder="e.g. 27447"
                  value={phCpt}
                  onChange={e => setPhCpt(e.target.value.trim())}
                  className="w-full border rounded px-3 py-2 font-mono text-sm"
                  maxLength={5}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">State</label>
                <input
                  type="text"
                  placeholder="e.g. TX"
                  value={phState}
                  onChange={e => setPhState(e.target.value.trim().toUpperCase())}
                  className="w-full border rounded px-3 py-2 text-sm"
                  maxLength={2}
                />
              </div>
              <button
                onClick={handlePhysicianLookup}
                disabled={phLoading || !phCpt || !phState}
                className="w-full bg-indigo-600 text-white py-2 px-4 rounded text-sm font-medium
                           hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {phLoading ? "Looking up…" : "Get Required ICD-10 Codes"}
              </button>
            </div>
          </div>

          {/* Error */}
          {phError && (
            <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700 text-sm mb-4">
              {phError}
            </div>
          )}

          {/* Physician Helper Result */}
          {phResult && (
            <div className="border rounded-lg bg-white overflow-hidden">
              {/* LCD / Article info */}
              <div className="bg-gray-50 border-b px-5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold">
                      CPT {phResult.cptCode} — {phResult.state}
                    </span>
                    {phResult.lcdId && (
                      <span className="text-xs text-gray-500 ml-2">
                        LCD {phResult.lcdId}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {totalCoveredCount} covered · {phResult.noncoveredCodes.length} noncovered
                  </div>
                </div>
                {phResult.lcdTitle && (
                  <p className="text-xs text-gray-500 mt-0.5">{phResult.lcdTitle}</p>
                )}
                {phResult.articleId && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Article: {phResult.articleId}
                    {phResult.articleTitle && ` — ${phResult.articleTitle}`}
                  </p>
                )}
              </div>

              {/* XX000 warning */}
              {phResult.xx000Message && (
                <div className="bg-amber-50 border-b border-amber-200 px-5 py-2">
                  <p className="text-xs text-amber-800">
                    ⚠️ {phResult.xx000Message}
                  </p>
                </div>
              )}

              {/* Tabs + filter */}
              <div className="px-5 pt-3 pb-2 flex items-center gap-2 border-b flex-wrap">
                <button
                  onClick={() => setPhTab("standalone")}
                  className={`text-sm font-medium px-3 py-1 rounded-full ${
                    phTab === "standalone"
                      ? "bg-green-100 text-green-800"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  ✓ Standalone ({phResult.standaloneCodes.length})
                </button>
                <button
                  onClick={() => setPhTab("combinations")}
                  className={`text-sm font-medium px-3 py-1 rounded-full ${
                    phTab === "combinations"
                      ? "bg-blue-100 text-blue-800"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  🔗 Combinations ({phResult.combinationGroups.length} groups)
                </button>
                <button
                  onClick={() => setPhTab("noncovered")}
                  className={`text-sm font-medium px-3 py-1 rounded-full ${
                    phTab === "noncovered"
                      ? "bg-red-100 text-red-800"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  ✗ Never Use ({phResult.noncoveredCodes.length})
                </button>
                <div className="flex-1" />
                <input
                  type="text"
                  placeholder="Filter codes…"
                  value={phFilter}
                  onChange={e => setPhFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-xs w-40"
                />
              </div>

              {/* Tab content */}
              <div className="max-h-[500px] overflow-y-auto">
                {phTab === "standalone" ? (
                  /* ── STANDALONE CODES ── */
                  filteredStandalone.length === 0 ? (
                    <p className="text-sm text-gray-400 p-5">
                      {phResult.standaloneCodes.length === 0
                        ? "No standalone codes — all codes require combinations for this CPT."
                        : "No codes match your filter."}
                    </p>
                  ) : (
                    <>
                      <div className="bg-green-50 px-5 py-2 border-b">
                        <p className="text-xs text-green-800">
                          <strong>These diagnoses work on their own.</strong> Any single code below is sufficient to support this procedure.
                        </p>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-green-50">
                          <tr>
                            <th className="text-left px-5 py-2 text-xs font-medium text-gray-500 w-28">Code</th>
                            <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStandalone.map((c, i) => (
                            <tr
                              key={c.code}
                              className={`border-t hover:bg-green-50/50 cursor-pointer ${
                                i % 2 === 0 ? "" : "bg-gray-50/30"
                              }`}
                              onClick={() => {
                                setIcd10Code(c.code)
                                if (!cptCode) setCptCode(phCpt)
                                if (!state) setState(phState)
                              }}
                              title="Click to use in Coverage Check"
                            >
                              <td className="px-5 py-1.5 font-mono text-xs text-green-700">{c.code}</td>
                              <td className="px-5 py-1.5 text-xs text-gray-600">{c.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )
                ) : phTab === "combinations" ? (
                  /* ── COMBINATION GROUPS ── */
                  phResult.combinationGroups.length === 0 ? (
                    <p className="text-sm text-gray-400 p-5">
                      No combination requirements — all covered codes are standalone.
                    </p>
                  ) : (
                    <div className="divide-y">
                      <div className="bg-blue-50 px-5 py-2">
                        <p className="text-xs text-blue-800">
                          <strong>These codes require combinations.</strong> You must bill a code from EACH required group together.
                        </p>
                      </div>
                      {phResult.combinationGroups.map((group) => (
                        <div key={group.groupNum} className="px-5 py-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded">
                              Group {group.groupNum}
                            </span>
                            {group.requiresGroups.length > 0 && (
                              <span className="text-xs text-blue-600">
                                Requires: Group {group.requiresGroups.join(" + Group ")}
                              </span>
                            )}
                          </div>
                          {group.paragraph && (
                            <p className="text-xs text-gray-600 mb-2 italic">{group.paragraph}</p>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {group.codes
                              .filter((c: { code: string; description: string }) =>
                                !phFilter || c.code.includes(phFilter.toUpperCase()) ||
                                c.description.toLowerCase().includes(phFilter.toLowerCase())
                              )
                              .map((c: { code: string; description: string }) => (
                              <span
                                key={c.code}
                                className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 text-xs font-mono cursor-pointer hover:bg-blue-100"
                                title={c.description}
                                onClick={() => {
                                  setIcd10Code(c.code)
                                  if (!cptCode) setCptCode(phCpt)
                                  if (!state) setState(phState)
                                }}
                              >
                                {c.code}
                                <span className="font-sans text-gray-400 max-w-[120px] truncate">
                                  {c.description}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  /* ── NONCOVERED ── */
                  filteredNoncovered.length === 0 ? (
                    <p className="text-sm text-gray-400 p-5">No noncovered codes found.</p>
                  ) : (
                    <>
                      <div className="bg-red-50 px-5 py-2 border-b">
                        <p className="text-xs text-red-800">
                          <strong>Never use these diagnoses.</strong> Medicare explicitly will NOT cover this procedure with these codes.
                        </p>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-red-50">
                          <tr>
                            <th className="text-left px-5 py-2 text-xs font-medium text-gray-500 w-28">Code</th>
                            <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredNoncovered.map((c, i) => (
                            <tr
                              key={c.code}
                              className={`border-t hover:bg-red-50/50 ${
                                i % 2 === 0 ? "" : "bg-gray-50/30"
                              }`}
                            >
                              <td className="px-5 py-1.5 font-mono text-xs text-red-700">{c.code}</td>
                              <td className="px-5 py-1.5 text-xs text-gray-600">{c.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )
                )}
              </div>

              {/* Message */}
              {phResult.message && (
                <div className="border-t px-5 py-3 text-xs text-gray-500">
                  {phResult.message}
                </div>
              )}
            </div>
          )}

          {/* ─────────────── Reverse Lookup: ICD-10 → CPTs ─────────────── */}
          <div className="bg-white border rounded-lg p-6 mt-6 mb-6">
            <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
              🔄 Reverse Lookup — ICD-10 → CPTs
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Enter a diagnosis to see every procedure that accepts it.
              Useful for spotting overbilling or bundled procedures.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">ICD-10 Code</label>
                <input
                  type="text"
                  placeholder="e.g. M17.11"
                  value={rvIcd}
                  onChange={e => setRvIcd(e.target.value.trim().toUpperCase())}
                  className="w-full border rounded px-3 py-2 font-mono text-sm"
                  maxLength={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">State</label>
                <input
                  type="text"
                  placeholder="e.g. TX"
                  value={rvState}
                  onChange={e => setRvState(e.target.value.trim().toUpperCase())}
                  className="w-full border rounded px-3 py-2 text-sm"
                  maxLength={2}
                />
              </div>
              <button
                onClick={handleReverseLookup}
                disabled={rvLoading || !rvIcd || !rvState}
                className="w-full bg-amber-600 text-white py-2 px-4 rounded text-sm font-medium
                           hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {rvLoading ? "Looking up…" : "Find CPTs for This Diagnosis"}
              </button>
            </div>
          </div>

          {/* Reverse lookup error */}
          {rvError && (
            <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700 text-sm mb-4">
              {rvError}
            </div>
          )}

          {/* Reverse lookup result */}
          {rvResult && (
            <div className="border rounded-lg bg-white overflow-hidden">
              <div className="bg-amber-50 border-b px-5 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    ICD-10 {rvResult.icd10Code} — {rvResult.state}
                  </span>
                  <span className="text-xs text-gray-500">
                    {rvResult.cpts.length} CPT{rvResult.cpts.length !== 1 ? "s" : ""} found
                  </span>
                </div>
              </div>

              {/* Filter */}
              <div className="px-5 pt-3 pb-2 border-b flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  These are all procedures that Medicare covers with this diagnosis.
                  If you see a CPT on your bill that's NOT here — it may be wrongly billed.
                </span>
                <div className="flex-1" />
                <input
                  type="text"
                  placeholder="Filter CPTs…"
                  value={rvFilter}
                  onChange={e => setRvFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-xs w-32 flex-shrink-0"
                />
              </div>

              {/* CPT table */}
              <div className="max-h-[400px] overflow-y-auto">
                {filteredCpts.length === 0 ? (
                  <p className="text-sm text-gray-400 p-5">No CPTs found.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-amber-50">
                      <tr>
                        <th className="text-left px-5 py-2 text-xs font-medium text-gray-500 w-24">CPT</th>
                        <th className="text-left px-5 py-2 text-xs font-medium text-gray-500 w-24">Status</th>
                        <th className="text-left px-5 py-2 text-xs font-medium text-gray-500 w-24">LCD</th>
                        <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">LCD Title</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCpts.map((c, i) => (
                        <tr
                          key={`${c.cptCode}-${c.lcdId}-${c.groupNum}`}
                          className={`border-t hover:bg-amber-50/50 cursor-pointer ${
                            i % 2 === 0 ? "" : "bg-gray-50/30"
                          }`}
                          onClick={() => {
                            setCptCode(c.cptCode)
                            setIcd10Code(rvIcd)
                            if (!state) setState(rvState)
                          }}
                          title="Click to check coverage in left column"
                        >
                          <td className="px-5 py-1.5 font-mono text-xs text-amber-800 font-semibold">{c.cptCode}</td>
                          <td className="px-5 py-1.5 text-xs">
                            {c.standalone ? (
                              <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                ✓ Standalone
                              </span>
                            ) : c.ruleType === "combination" ? (
                              <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                    title={`Requires Group ${c.requiresGroups.join(" + Group ")}`}>
                                🔗 Combo (Grp {c.requiresGroups.join("+")})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                Grp {c.groupNum}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-1.5 font-mono text-xs text-gray-500">{c.lcdId ?? "—"}</td>
                          <td className="px-5 py-1.5 text-xs text-gray-600 truncate max-w-[200px]">{c.lcdTitle ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Bundling hint */}
              {rvResult.cpts.length > 1 && (
                <div className="border-t bg-yellow-50 px-5 py-3">
                  <p className="text-xs font-medium text-yellow-800 mb-1">
                    💡 Bundling check
                  </p>
                  <p className="text-xs text-yellow-700">
                    If your bill has multiple CPTs from this list, some may be
                    bundled — meaning the larger procedure already includes the
                    smaller one. Billing both separately is called "unbundling"
                    and is a common overbilling tactic. Check the CCI (Correct
                    Coding Initiative) edits to verify.
                  </p>
                </div>
              )}

              {rvResult.message && (
                <div className="border-t px-5 py-3 text-xs text-gray-500">
                  {rvResult.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MANUAL BILLING CHECKERS — full-width row of 3 cards
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-12 mb-4">
        <h2 className="text-xl font-bold mb-1">Manual Billing Checkers</h2>
        <p className="text-gray-600 text-sm mb-6">
          Look up individual CPT codes against CMS data — PTP edits, MUE limits, and Medicare fee schedule rates.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ──────────── PTP (NCCI Bundling) Checker ──────────── */}
        <div>
          <div className="bg-white border rounded-lg p-5">
            <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
              🔗 PTP Bundling Checker
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Check if two CPTs are bundled under NCCI edits. If bundled, billing both is a violation.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">CPT Code 1 (Column 1)</label>
                <input
                  type="text"
                  placeholder="e.g. 27447"
                  value={ptpCpt1}
                  onChange={e => setPtpCpt1(e.target.value.trim())}
                  className="w-full border rounded px-3 py-2 font-mono text-sm"
                  maxLength={5}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">CPT Code 2 (Column 2)</label>
                <input
                  type="text"
                  placeholder="e.g. 27446"
                  value={ptpCpt2}
                  onChange={e => setPtpCpt2(e.target.value.trim())}
                  className="w-full border rounded px-3 py-2 font-mono text-sm"
                  maxLength={5}
                />
              </div>
              <button
                onClick={handlePtpCheck}
                disabled={ptpLoading || !ptpCpt1 || !ptpCpt2}
                className="w-full bg-violet-600 text-white py-2 px-4 rounded text-sm font-medium
                           hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {ptpLoading ? "Checking…" : "Check Bundling"}
              </button>
            </div>
          </div>

          {ptpError && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-xs mt-3">{ptpError}</div>
          )}

          {ptpResult && (
            <div className={`border rounded-lg p-4 mt-3 ${
              ptpResult.bundled ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-lg font-bold ${ptpResult.bundled ? "text-red-700" : "text-green-700"}`}>
                  {ptpResult.bundled ? "⚠️ BUNDLED" : "✓ Not Bundled"}
                </span>
              </div>
              <p className="text-sm text-gray-700 mb-3">{ptpResult.message}</p>

              {ptpResult.flags.length > 0 && (
                <div className="space-y-2">
                  {ptpResult.flags.map((f, i) => (
                    <div key={i} className="bg-white border rounded p-3 text-xs space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-semibold">{f.cpt1} + {f.cpt2}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          f.modifierInd === "0" ? "bg-red-100 text-red-700" :
                          f.modifierInd === "1" ? "bg-amber-100 text-amber-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          Modifier Ind: {f.modifierInd}
                          {f.modifierInd === "0" && " (no modifier allowed)"}
                          {f.modifierInd === "1" && " (modifier may override)"}
                          {f.modifierInd === "9" && " (N/A)"}
                        </span>
                      </div>
                      <div className="text-gray-500">Setting: {f.setting || "All"}</div>
                      {f.rationale && <div className="text-gray-600">Rationale: {f.rationale}</div>}
                      {f.detail && <div className="text-gray-600">{f.detail}</div>}
                    </div>
                  ))}
                </div>
              )}

              {ptpResult.bundled && (
                <div className="mt-3 pt-3 border-t border-red-200">
                  <p className="text-xs text-red-800">
                    <strong>What this means:</strong> These codes should not be billed together.
                    {ptpResult.flags.some(f => f.modifierInd === "1")
                      ? " A modifier MAY allow separate billing — but the provider must document medical necessity."
                      : " No modifier override is allowed — billing both is a clear violation."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ──────────── MUE Checker ──────────── */}
        <div>
          <div className="bg-white border rounded-lg p-5">
            <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
              📏 MUE Limit Checker
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Check the maximum units allowed per day for a CPT code. Billing above the MUE limit is a red flag.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">CPT Code</label>
                <input
                  type="text"
                  placeholder="e.g. 99213"
                  value={mueCpt}
                  onChange={e => setMueCpt(e.target.value.trim())}
                  className="w-full border rounded px-3 py-2 font-mono text-sm"
                  maxLength={5}
                />
              </div>
              <button
                onClick={handleMueCheck}
                disabled={mueLoading || !mueCpt}
                className="w-full bg-orange-600 text-white py-2 px-4 rounded text-sm font-medium
                           hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mueLoading ? "Checking…" : "Check MUE Limit"}
              </button>
            </div>
          </div>

          {mueError && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-xs mt-3">{mueError}</div>
          )}

          {mueResult && (
            <div className={`border rounded-lg p-4 mt-3 ${
              mueResult.limits.length > 0 ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"
            }`}>
              <p className="text-sm font-medium text-gray-800 mb-3">{mueResult.message}</p>

              {mueResult.limits.length > 0 ? (
                <div className="space-y-2">
                  {mueResult.limits.map((lim, i) => (
                    <div key={i} className="bg-white border rounded p-3 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-semibold">CPT {lim.cptCode}</span>
                        <span className="text-lg font-bold text-blue-700">{lim.mueValue} units/day</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-gray-500">
                        <div>Setting: <span className="text-gray-700">{lim.setting || "All"}</span></div>
                        <div>MAI: <span className={`font-medium ${
                          lim.mai === "1" ? "text-red-600" :
                          lim.mai === "2" ? "text-amber-600" :
                          lim.mai === "3" ? "text-green-600" :
                          "text-gray-700"
                        }`}>
                          {lim.mai || "—"}
                          {lim.mai === "1" && " (absolute limit)"}
                          {lim.mai === "2" && " (date of service)"}
                          {lim.mai === "3" && " (clinical — may appeal)"}
                        </span></div>
                      </div>
                      {lim.rationale && (
                        <div className="mt-1 text-gray-500">Rationale: {lim.rationale}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No MUE data found for this CPT code.</p>
              )}

              {mueResult.limits.some(l => l.mai === "3") && (
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <p className="text-xs text-blue-800">
                    <strong>💡 MAI 3 = Clinical:</strong> If units billed exceed this limit, an appeal
                    with medical necessity documentation may succeed. The limit isn't absolute.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ──────────── PFS Rate Checker ──────────── */}
        <div>
          <div className="bg-white border rounded-lg p-5">
            <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
              💲 Medicare Rate Checker
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Look up the Medicare fee schedule rate for a CPT. Add a state &amp; locality for GPCI-adjusted pricing.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">CPT Code</label>
                <input
                  type="text"
                  placeholder="e.g. 27447"
                  value={pfsCpt}
                  onChange={e => setPfsCpt(e.target.value.trim())}
                  className="w-full border rounded px-3 py-2 font-mono text-sm"
                  maxLength={5}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">State <span className="text-gray-400 font-normal">(optional — for GPCI adjustment)</span></label>
                <input
                  type="text"
                  placeholder="e.g. TX"
                  value={pfsState}
                  onChange={e => handlePfsStateChange(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  maxLength={2}
                />
              </div>

              {/* Locality picker — appears when state has multiple localities */}
              {pfsLocalities.length > 1 && (
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Locality <span className="text-gray-400 font-normal">({pfsLocalities.length} areas in {pfsState})</span>
                  </label>
                  <select
                    value={pfsLocality}
                    onChange={e => setPfsLocality(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    <option value="">First available (default)</option>
                    {pfsLocalities.map(l => (
                      <option key={l.localityNumber} value={l.localityNumber}>
                        {l.localityName} (#{l.localityNumber})
                        {l.counties ? ` — ${l.counties}` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    💡 Rates vary by county. Pick the locality that covers your county for the most accurate price.
                  </p>
                </div>
              )}

              {/* Setting — Facility vs Non-Facility */}
              <div>
                <label className="block text-xs font-medium mb-1">Where was the service performed?</label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded border hover:bg-gray-50 transition-colors">
                    <input
                      type="radio"
                      name="pfsSetting"
                      checked={pfsSetting === "facility"}
                      onChange={() => setPfsSetting("facility")}
                      className="accent-teal-600 mt-0.5"
                    />
                    <div>
                      <div className="font-medium">🏥 Hospital / Surgery Center</div>
                      <div className="text-xs text-gray-500">Inpatient, outpatient hospital, or ASC — the facility bills separately for overhead</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded border hover:bg-gray-50 transition-colors">
                    <input
                      type="radio"
                      name="pfsSetting"
                      checked={pfsSetting === "nonfacility"}
                      onChange={() => setPfsSetting("nonfacility")}
                      className="accent-teal-600 mt-0.5"
                    />
                    <div>
                      <div className="font-medium">🏢 Doctor's Office / Clinic</div>
                      <div className="text-xs text-gray-500">Private practice or standalone clinic — physician covers all overhead costs</div>
                    </div>
                  </label>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  💡 <strong>Not sure?</strong> Check your bill — if it's from a hospital, pick Hospital.
                  Hospital rates are lower because the facility charges separately. If you received a single bill from a doctor's office, pick Doctor's Office.
                </p>
              </div>

              <button
                onClick={handlePfsCheck}
                disabled={pfsLoading || !pfsCpt}
                className="w-full bg-teal-600 text-white py-2 px-4 rounded text-sm font-medium
                           hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pfsLoading ? "Looking up…" : "Get Medicare Rate"}
              </button>
            </div>
          </div>

          {pfsError && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-xs mt-3">{pfsError}</div>
          )}

          {pfsResult && (
            <div className={`border rounded-lg p-4 mt-3 ${
              pfsResult.rate ? "bg-teal-50 border-teal-200" : "bg-gray-50 border-gray-200"
            }`}>
              <p className="text-sm font-medium text-gray-800 mb-3">{pfsResult.message}</p>

              {pfsResult.rate ? (
                <div className="space-y-3">
                  {/* Payment headline */}
                  <div className="bg-white border rounded p-4 text-center">
                    <div className="text-3xl font-bold text-teal-700">
                      ${pfsResult.rate.payment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Medicare Allowed Amount · {pfsSetting === "facility" ? "🏥 Hospital" : "🏢 Office"} · {pfsResult.rate.source === "gpci_adjusted" ? "GPCI-Adjusted" : "National"}
                    </div>
                  </div>

                  {/* Description */}
                  {pfsResult.rate.description && (
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">Description:</span> {pfsResult.rate.description}
                    </div>
                  )}

                  {/* RVU breakdown */}
                  <div className="bg-white border rounded p-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">RVU Breakdown</h4>
                    {pfsResult.rate.workRvu != null ? (
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <div className="text-sm font-bold text-gray-800">{pfsResult.rate.workRvu.toFixed(2)}</div>
                          <div className="text-gray-400">Work RVU</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-800">{pfsResult.rate.peRvu?.toFixed(2) ?? "—"}</div>
                          <div className="text-gray-400">PE RVU</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-800">{pfsResult.rate.mpRvu?.toFixed(2) ?? "—"}</div>
                          <div className="text-gray-400">MP RVU</div>
                        </div>
                      </div>
                    ) : pfsResult.rate.totalRvu != null ? (
                      <div className="text-center text-xs">
                        <div className="text-sm font-bold text-gray-800">{pfsResult.rate.totalRvu.toFixed(4)}</div>
                        <div className="text-gray-400">Total RVU (national)</div>
                      </div>
                    ) : null}
                  </div>

                  {/* GPCI factors (if GPCI-adjusted) */}
                  {pfsResult.rate.gpci && (
                    <div className="bg-white border rounded p-3">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">GPCI Factors</h4>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <div className="text-sm font-bold text-gray-800">{pfsResult.rate.gpci.pw.toFixed(3)}</div>
                          <div className="text-gray-400">PW GPCI</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-800">{pfsResult.rate.gpci.pe.toFixed(3)}</div>
                          <div className="text-gray-400">PE GPCI</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-800">{pfsResult.rate.gpci.mp.toFixed(3)}</div>
                          <div className="text-gray-400">MP GPCI</div>
                        </div>
                      </div>
                      {pfsResult.rate.locality && (
                        <div className="text-xs text-gray-500 mt-2 text-center">
                          Locality: {pfsResult.rate.locality}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Conversion factor */}
                  <div className="text-xs text-gray-500 text-center">
                    CY2026 Conversion Factor: ${pfsResult.rate.convFactor.toFixed(4)}
                  </div>

                  {/* Overcharge tip */}
                  <div className="bg-teal-100/50 border border-teal-200 rounded p-3 text-xs text-teal-800">
                    <strong>💡 Tip:</strong> Compare this Medicare rate against what your bill charged.
                    If the billed amount is more than 2× the Medicare rate, it's a strong negotiation point —
                    even if you don't have Medicare.
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No fee schedule data found for this CPT code.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
