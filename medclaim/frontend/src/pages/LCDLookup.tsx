import { useState } from "react"
import { lcdApi } from "@/lib/api"
import type { LCDCoverage } from "@/types"

/**
 * LCD Lookup page — first real feature to build and test.
 *
 * Simple input: CPT code + ICD-10 + state
 * Output: covered/not covered + documentation checklist
 *
 * This powers BOTH products:
 * - Patient: "was my denial wrongful?"
 * - Physician: "what do I need to document?"
 */

export default function LCDLookup() {
  const [cptCode, setCptCode]     = useState("")
  const [icd10Code, setIcd10Code] = useState("")
  const [state, setState]         = useState("")
  const [result, setResult]       = useState<(LCDCoverage & { message: string }) | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleLookup() {
    if (!cptCode || !icd10Code || !state) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await lcdApi.lookup({ cptCode, icd10Code, state })
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">LCD Coverage Lookup</h1>
      <p className="text-gray-600 mb-8">
        Check if a procedure is covered by Medicare for a given diagnosis.
        If covered and you were denied — your denial was wrongful.
      </p>

      {/* Inputs */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-1">
            CPT Procedure Code
          </label>
          <input
            type="text"
            placeholder="e.g. 27447"
            value={cptCode}
            onChange={e => setCptCode(e.target.value.trim())}
            className="w-full border rounded px-3 py-2 font-mono"
            maxLength={5}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            ICD-10 Diagnosis Code
          </label>
          <input
            type="text"
            placeholder="e.g. M17.11"
            value={icd10Code}
            onChange={e => setIcd10Code(e.target.value.trim().toUpperCase())}
            className="w-full border rounded px-3 py-2 font-mono"
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
            className="w-full border rounded px-3 py-2"
            maxLength={2}
          />
        </div>

        <button
          onClick={handleLookup}
          disabled={loading || !cptCode || !icd10Code || !state}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded
                     hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Looking up..." : "Check Coverage"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`border rounded p-6 space-y-4 ${
          result.covered
            ? "bg-green-50 border-green-200"
            : "bg-red-50 border-red-200"
        }`}>
          {/* Covered / Not Covered */}
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold ${
              result.covered ? "text-green-700" : "text-red-700"
            }`}>
              {result.covered ? "✓ Covered" : "✗ Not Covered"}
            </span>
          </div>

          <p className="text-gray-700">{result.message}</p>

          {/* Medicare Rate */}
          {result.medicareRate && (
            <div className="bg-white rounded p-3 border">
              <span className="text-sm text-gray-500">Medicare rate: </span>
              <span className="font-semibold">
                ${result.medicareRate.toFixed(2)}
              </span>
            </div>
          )}

          {/* LCD Reference */}
          {result.lcdId && (
            <div className="text-sm text-gray-600">
              LCD: <span className="font-mono">{result.lcdId}</span>
              {result.title && ` — ${result.title}`}
            </div>
          )}

          {/* Article Reference */}
          {result.articleId && (
            <div className="text-sm text-gray-600">
              Article: <span className="font-mono">{result.articleId}</span>
              {result.articleTitle && ` — ${result.articleTitle}`}
            </div>
          )}

          {/* ICD-10 Description */}
          {result.icd10Description && (
            <div className="text-sm text-gray-600">
              Diagnosis: <span className="font-mono">{result.icd10Code}</span> — {result.icd10Description}
            </div>
          )}

          {/* Covered ICD-10 samples */}
          {result.coveredIcd10Codes && result.coveredIcd10Codes.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">
                {result.covered
                  ? "Other Covered Diagnoses for This Procedure"
                  : "Diagnoses That ARE Covered for This Procedure"}
              </h3>
              <p className="text-sm text-gray-600 mb-2">
                {result.covered
                  ? "This CPT is also covered with these ICD-10 codes:"
                  : "Your diagnosis wasn't covered, but these diagnoses are — useful for appeals:"}
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {result.coveredIcd10Codes.map((item: any, i: number) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded px-2 py-0.5 text-xs font-mono"
                    title={item.description || item}
                  >
                    {typeof item === "string" ? item : item.code}
                    {typeof item === "object" && item.description && (
                      <span className="font-sans text-gray-400 max-w-[200px] truncate">
                        {item.description}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Documentation Criteria — the physician checklist */}
          {result.documentationCriteria.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">
                Required Documentation
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                Insurance can only deny this if your chart is missing one of these:
              </p>
              <ul className="space-y-2">
                {result.documentationCriteria.map((criterion, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      id={`criterion-${i}`}
                    />
                    <label htmlFor={`criterion-${i}`} className="text-sm">
                      {criterion}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Appeal CTA */}
          {result.covered && (
            <div className="pt-4 border-t border-green-200">
              <p className="text-sm font-medium text-green-800 mb-2">
                This procedure is covered. If you were denied, we can write
                your appeal letter citing LCD {result.lcdId}.
              </p>
              <button className="bg-green-700 text-white px-4 py-2 rounded text-sm
                                 hover:bg-green-800">
                Generate Appeal Letter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
