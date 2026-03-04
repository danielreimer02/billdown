import { useState } from "react"
import { lcdApi } from "@/lib/api"

/**
 * For Physicians page — prior auth protection & LCD coding reference.
 *
 * This is the physician-facing product:
 * - Look up which ICD-10 codes support a CPT before submitting
 * - Understand standalone vs combination requirements
 * - Pre-check prior auth denials risk
 * - Build compliant documentation
 */

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

export default function ForPhysicians() {
  const [cpt, setCpt] = useState("")
  const [state, setState] = useState("")
  const [result, setResult] = useState<CoveredCodesResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Accordion state — which sections are expanded
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleLookup() {
    if (!cpt || !state) return
    setLoading(true)
    setError(null)
    setResult(null)
    setExpanded(new Set()) // reset accordions
    try {
      const data = await lcdApi.coveredCodes({ cptCode: cpt, state })
      setResult(data)
      // Auto-expand standalone if it has codes
      if (data.standaloneCodes.length > 0) setExpanded(new Set(["standalone"]))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">For Physicians</h1>
        <p className="text-gray-600 text-lg">
          Code correctly the first time. Prevent denials before they happen.
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-green-50 border border-green-200 rounded-lg p-5">
          <div className="text-2xl mb-2">1️⃣</div>
          <h3 className="font-semibold text-green-800 mb-1">Enter Your CPT + State</h3>
          <p className="text-sm text-green-700">
            Tell us what procedure you're planning and where your patient is located.
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
          <div className="text-2xl mb-2">2️⃣</div>
          <h3 className="font-semibold text-blue-800 mb-1">See Required Diagnoses</h3>
          <p className="text-sm text-blue-700">
            We show you exactly which ICD-10 codes Medicare accepts — standalone
            codes and required combinations.
          </p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-5">
          <div className="text-2xl mb-2">3️⃣</div>
          <h3 className="font-semibold text-purple-800 mb-1">Submit with Confidence</h3>
          <p className="text-sm text-purple-700">
            Use the right codes from the start. No prior auth surprises,
            no denials, no appeals needed.
          </p>
        </div>
      </div>

      {/* Lookup form */}
      <div className="bg-white border rounded-lg p-6 mb-8 max-w-lg">
        <h2 className="text-lg font-semibold mb-1">🩺 Pre-Authorization Code Check</h2>
        <p className="text-sm text-gray-500 mb-4">
          Check what ICD-10 codes you need before submitting a claim or prior auth request.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">CPT Code</label>
            <input
              type="text"
              placeholder="e.g. 27447"
              value={cpt}
              onChange={e => setCpt(e.target.value.trim())}
              className="w-full border rounded px-3 py-2 font-mono text-sm"
              maxLength={5}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Patient State</label>
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
            disabled={loading || !cpt || !state}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded text-sm font-medium
                       hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Looking up…" : "Check Required Diagnoses"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700 text-sm mb-6">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-gray-50 border rounded-lg p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold">
                CPT {result.cptCode} — {result.state}
              </h2>
              {result.lcdId && (
                <span className="text-sm text-gray-500">LCD {result.lcdId}</span>
              )}
            </div>
            {result.lcdTitle && <p className="text-sm text-gray-500">{result.lcdTitle}</p>}
            {result.articleId && (
              <p className="text-xs text-gray-400">
                Article {result.articleId}{result.articleTitle && ` — ${result.articleTitle}`}
              </p>
            )}
          </div>

          {/* XX000 warning */}
          {result.xx000Message && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800">⚠️ {result.xx000Message}</p>
            </div>
          )}

          {/* ── Standalone codes (accordion) ── */}
          {result.standaloneCodes.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggle("standalone")}
                className="w-full flex items-center justify-between bg-green-50 px-5 py-3 text-left
                           hover:bg-green-100/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block text-green-600 transition-transform duration-200 ${
                      expanded.has("standalone") ? "rotate-90" : ""
                    }`}
                  >▶</span>
                  <h3 className="font-semibold text-green-800 flex items-center gap-2">
                    ✓ Standalone Diagnoses
                    <span className="bg-green-200 text-green-900 text-xs px-2 py-0.5 rounded-full font-normal">
                      {result.standaloneCodes.length}
                    </span>
                  </h3>
                </div>
                <span className="text-xs text-green-600">
                  {expanded.has("standalone") ? "Collapse" : "Expand"}
                </span>
              </button>
              {expanded.has("standalone") && (
                <div className="border-t border-green-200">
                  <p className="text-xs text-green-700 px-5 py-2 bg-green-50/50">
                    Any single code below is sufficient. Use whichever best matches the patient's condition.
                  </p>
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-green-50">
                        <tr>
                          <th className="text-left px-5 py-2 text-xs font-medium text-gray-500 w-28">ICD-10</th>
                          <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.standaloneCodes.map((c, i) => (
                          <tr key={c.code} className={`border-t ${i % 2 === 0 ? "" : "bg-gray-50/30"}`}>
                            <td className="px-5 py-1.5 font-mono text-xs text-green-700 font-semibold">{c.code}</td>
                            <td className="px-5 py-1.5 text-xs text-gray-600">{c.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Combination groups (each group is its own accordion) ── */}
          {result.combinationGroups.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-blue-800">🔗 Required Combinations</h3>
                <span className="bg-blue-200 text-blue-900 text-xs px-2 py-0.5 rounded-full font-normal">
                  {result.combinationGroups.length} groups
                </span>
              </div>
              <p className="text-xs text-blue-700 -mt-1">
                These codes require billing from MULTIPLE groups together. Expand each group to see its codes.
              </p>
              {result.combinationGroups.map(group => {
                const key = `combo-${group.groupNum}`
                return (
                  <div key={group.groupNum} className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggle(key)}
                      className="w-full flex items-center justify-between bg-blue-50 px-5 py-3 text-left
                                 hover:bg-blue-100/60 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block text-blue-600 transition-transform duration-200 ${
                            expanded.has(key) ? "rotate-90" : ""
                          }`}
                        >▶</span>
                        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded">
                          Group {group.groupNum}
                        </span>
                        {group.requiresGroups.length > 0 && (
                          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                            Must pair with Group {group.requiresGroups.join(" + Group ")}
                          </span>
                        )}
                        <span className="text-xs text-blue-500">{group.codes.length} codes</span>
                      </div>
                      <span className="text-xs text-blue-600">
                        {expanded.has(key) ? "Collapse" : "Expand"}
                      </span>
                    </button>
                    {expanded.has(key) && (
                      <div className="border-t border-blue-200 px-5 py-4 bg-white">
                        {group.paragraph && (
                          <p className="text-xs text-gray-600 mb-3 italic bg-gray-50 rounded p-2">
                            {group.paragraph}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {group.codes.map((c: { code: string; description: string }) => (
                            <span
                              key={c.code}
                              className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded px-2 py-1 text-xs"
                              title={c.description}
                            >
                              <span className="font-mono font-semibold text-blue-800">{c.code}</span>
                              <span className="text-gray-500 max-w-[140px] truncate">{c.description}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Noncovered codes (accordion) ── */}
          {result.noncoveredCodes.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggle("noncovered")}
                className="w-full flex items-center justify-between bg-red-50 px-5 py-3 text-left
                           hover:bg-red-100/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block text-red-600 transition-transform duration-200 ${
                      expanded.has("noncovered") ? "rotate-90" : ""
                    }`}
                  >▶</span>
                  <h3 className="font-semibold text-red-800 flex items-center gap-2">
                    ✗ Never Use These
                    <span className="bg-red-200 text-red-900 text-xs px-2 py-0.5 rounded-full font-normal">
                      {result.noncoveredCodes.length}
                    </span>
                  </h3>
                </div>
                <span className="text-xs text-red-600">
                  {expanded.has("noncovered") ? "Collapse" : "Expand"}
                </span>
              </button>
              {expanded.has("noncovered") && (
                <div className="border-t border-red-200">
                  <p className="text-xs text-red-700 px-5 py-2 bg-red-50/50">
                    Medicare explicitly does NOT cover this procedure with these diagnoses. Using them guarantees a denial.
                  </p>
                  <div className="max-h-[300px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-red-50">
                        <tr>
                          <th className="text-left px-5 py-2 text-xs font-medium text-gray-500 w-28">ICD-10</th>
                          <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.noncoveredCodes.map((c, i) => (
                          <tr key={c.code} className={`border-t ${i % 2 === 0 ? "" : "bg-gray-50/30"}`}>
                            <td className="px-5 py-1.5 font-mono text-xs text-red-700">{c.code}</td>
                            <td className="px-5 py-1.5 text-xs text-gray-600">{c.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Message */}
          <div className="text-xs text-gray-500 text-center">
            {result.message}
          </div>
        </div>
      )}

      {/* Bottom info */}
      <div className="mt-12 bg-indigo-50 border border-indigo-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-indigo-800 mb-2">Why This Matters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-indigo-700">
          <div>
            <strong>Prior Auth Denials:</strong> The #1 cause of prior auth denial is using an ICD-10 code
            that Medicare doesn't recognize for that procedure. This tool shows you the exact codes they accept.
          </div>
          <div>
            <strong>Combination Rules:</strong> Some procedures require diagnosis codes from multiple groups.
            If you only submit one group, the claim gets denied — even if the individual code is correct.
          </div>
          <div>
            <strong>LCD Citations:</strong> When appealing a denial, citing the specific LCD and article
            number is the fastest way to get it overturned. We provide those references automatically.
          </div>
          <div>
            <strong>State-Specific:</strong> Coverage varies by state because different Medicare Administrative
            Contractors (MACs) manage different regions. Always check for the patient's state.
          </div>
        </div>
      </div>
    </div>
  )
}
