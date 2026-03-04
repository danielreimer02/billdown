import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { casesApi, documentsApi } from "@/lib/api"
import type { ExtractedCodesResponse, AnalysisResponse, Flag } from "@/types"

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]

type Step = "upload" | "processing" | "review" | "analyzing" | "results"

interface EditableLineItem {
  id: string
  cptCode: string
  icd10Codes: string[]
  units: number
  amountBilled: number | null
  userConfirmed: boolean
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  return "Something went wrong"
}

function flagColor(type: string) {
  if (type === "bundling") return "bg-red-50 border-red-200 text-red-800"
  if (type === "mue") return "bg-amber-50 border-amber-200 text-amber-800"
  if (type === "price") return "bg-orange-50 border-orange-200 text-orange-800"
  return "bg-gray-50 border-gray-200 text-gray-800"
}

function flagLabel(type: string) {
  if (type === "bundling") return "Bundling"
  if (type === "mue") return "Units"
  if (type === "price") return "Price"
  return type
}

const STORAGE_KEY = "medclaim:billAnalysis"

interface PersistedState {
  step: Step
  state: string
  caseId: string | null
  lineItems: EditableLineItem[]
  analysis: AnalysisResponse | null
}

function loadPersistedState(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    // Don't restore transient states — polling won't be running on reload
    if (parsed.step === "processing" || parsed.step === "analyzing") {
      // If we have analysis results, go to results
      if (parsed.analysis && parsed.analysis.lineItems?.length > 0) {
        parsed.step = "results"
      // If we have line items, go to review
      } else if (parsed.lineItems && parsed.lineItems.length > 0) {
        parsed.step = "review"
      // Otherwise start over
      } else {
        parsed.step = "upload"
      }
    }
    return parsed
  } catch { return {} }
}

function persistState(s: PersistedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* full */ }
}

export default function BillAnalysis() {
  const saved = useRef(loadPersistedState()).current
  const navigate = useNavigate()

  // ── State ──
  const [step, setStep] = useState<Step>(saved.step ?? "upload")
  const [state, setState] = useState(saved.state ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Backend IDs
  const [caseId, setCaseId] = useState<string | null>(saved.caseId ?? null)

  // Extracted codes for review
  const [lineItems, setLineItems] = useState<EditableLineItem[]>(saved.lineItems ?? [])

  // Analysis results
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(saved.analysis ?? null)
  const [confirming, setConfirming] = useState(false)

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Persist state changes to localStorage
  useEffect(() => {
    persistState({ step, state, caseId, lineItems, analysis })
  }, [step, state, caseId, lineItems, analysis])

  // Clean up polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // ── Upload handler ──
  async function handleUpload() {
    if (!file) return
    setError(null)

    try {
      // 1. Create a case
      const c = await casesApi.create({
        caseType: "billing",
        state: state || "NY",
      })
      setCaseId(c.id)

      // 2. Upload the file — OCR starts in background
      setStep("processing")
      await documentsApi.upload(c.id, file, "itemized_bill")

      // 3. Poll until status changes from uploaded/ocr_processing
      pollRef.current = setInterval(async () => {
        try {
          const updated = await casesApi.get(c.id)
          const s = updated.status

          if (s === "needs_review") {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
            // Fetch extracted codes
            const codes = await documentsApi.extractedCodes(c.id)
            setLineItems(codes.lineItems.map((li) => ({ ...li })))
            setStep("review")
          } else if (!["uploaded", "ocr_processing"].includes(s)) {
            // Unexpected state — stop polling
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
            setError(`Unexpected status: ${s}`)
            setStep("upload")
          }
        } catch { /* retry silently */ }
      }, 2000)
    } catch (err) {
      setError(errMsg(err))
      setStep("upload")
    }
  }

  // ── Confirm codes ──
  async function handleConfirm() {
    if (!caseId || lineItems.length === 0) return
    setConfirming(true)
    setError(null)

    try {
      await documentsApi.confirmCodes(
        caseId,
        lineItems.map((li) => ({
          id: li.id,
          cptCode: li.cptCode,
          icd10Codes: li.icd10Codes,
          units: li.units,
          amountBilled: li.amountBilled,
        }))
      )
      setStep("analyzing")

      // Poll for analysis completion
      pollRef.current = setInterval(async () => {
        try {
          const updated = await casesApi.get(caseId)
          if (["analyzed", "letters_ready"].includes(updated.status)) {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
            const result = await documentsApi.analysis(caseId)
            setAnalysis(result)
            setStep("results")
          }
        } catch { /* retry */ }
      }, 2000)
    } catch (err) {
      setError(errMsg(err))
      setStep("review")
    } finally {
      setConfirming(false)
    }
  }

  // ── Add a blank line item ──
  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        cptCode: "",
        icd10Codes: [],
        units: 1,
        amountBilled: null,
        userConfirmed: false,
      },
    ])
  }

  // ── Remove a line item ──
  function removeLineItem(id: string) {
    setLineItems((prev) => prev.filter((li) => li.id !== id))
  }

  // ── Update a line item field ──
  function updateLineItem(id: string, field: string, value: any) {
    setLineItems((prev) =>
      prev.map((li) => (li.id === id ? { ...li, [field]: value } : li))
    )
  }

  // ── Reset ──
  function reset() {
    setStep("upload")
    setFile(null)
    setCaseId(null)
    setLineItems([])
    setAnalysis(null)
    setError(null)
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ok */ }
  }

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Bill Analysis</h1>
      <p className="text-gray-500 text-sm mb-8">
        Upload a medical bill and we'll extract the codes, let you review them, and run a full analysis.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* ─── Step 1: Upload ─── */}
      {step === "upload" && (
        <div className="space-y-6">
          {/* State picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-48 border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select state…</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Used for GPCI locality pricing adjustments</p>
          </div>

          {/* File drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
              dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files[0]
              if (f) setFile(f)
            }}
            onClick={() => {
              const input = document.createElement("input")
              input.type = "file"
              input.accept = ".pdf,.jpg,.jpeg,.png"
              input.onchange = (e) => {
                const f = (e.target as HTMLInputElement).files?.[0]
                if (f) setFile(f)
              }
              input.click()
            }}
          >
            {file ? (
              <div>
                <p className="text-lg font-semibold text-gray-800">{file.name}</p>
                <p className="text-sm text-gray-500 mt-1">{(file.size / 1024).toFixed(0)} KB</p>
                <p className="text-xs text-gray-400 mt-2">Click or drop to replace</p>
              </div>
            ) : (
              <div>
                <p className="text-lg text-gray-500 mb-2">Drop your bill here</p>
                <p className="text-sm text-gray-400">PDF, JPG, or PNG — itemized bills work best</p>
              </div>
            )}
          </div>

          <button
            disabled={!file}
            onClick={handleUpload}
            className="w-full bg-blue-600 text-white py-3 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Upload & Extract Codes
          </button>
        </div>
      )}

      {/* ─── Step 2: Processing ─── */}
      {step === "processing" && (
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600 mb-4" />
          <p className="text-gray-600 font-medium">Processing your document…</p>
          <p className="text-gray-400 text-sm mt-2">Running OCR and extracting codes. This may take 15–30 seconds.</p>
          <button
            onClick={reset}
            className="mt-6 text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ─── Step 3: Review Extracted Codes ─── */}
      {step === "review" && (
        <div>
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-6">
            <h2 className="font-semibold text-sm mb-1">Review Extracted Codes</h2>
            <p className="text-xs text-gray-600">
              We pulled these from your bill. Please verify and correct anything that looks wrong, then confirm.
            </p>
          </div>

          {lineItems.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <p className="text-gray-500 text-sm mb-3">No codes were extracted from your document.</p>
              <p className="text-gray-400 text-xs mb-4">You can add them manually below.</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-8">#</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">CPT Code</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Units</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Billed</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">ICD-10 Codes</th>
                    <th className="px-4 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li, idx) => (
                    <tr key={li.id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={li.cptCode}
                          onChange={(e) => updateLineItem(li.id, "cptCode", e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm font-mono focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                          placeholder="99213"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="1"
                          value={li.units}
                          onChange={(e) => updateLineItem(li.id, "units", Number(e.target.value))}
                          className="w-20 border rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={li.amountBilled ?? ""}
                            onChange={(e) =>
                              updateLineItem(li.id, "amountBilled", e.target.value ? Number(e.target.value) : null)
                            }
                            className="w-28 border rounded pl-6 pr-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                            placeholder="0.00"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={li.icd10Codes.join(", ")}
                          onChange={(e) =>
                            updateLineItem(
                              li.id,
                              "icd10Codes",
                              e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                            )
                          }
                          className="w-full border rounded px-2 py-1.5 text-sm font-mono focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                          placeholder="M17.11, Z96.651"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => removeLineItem(li.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          title="Remove line"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={addLineItem}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Add Line Item
            </button>
          </div>

          <button
            disabled={confirming || lineItems.length === 0}
            onClick={handleConfirm}
            className="w-full bg-blue-600 text-white py-3 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirming ? "Submitting…" : "Confirm Codes & Run Analysis"}
          </button>
        </div>
      )}

      {/* ─── Step 4: Analyzing ─── */}
      {step === "analyzing" && (
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600 mb-4" />
          <p className="text-gray-600 font-medium">Running analysis…</p>
          <p className="text-gray-400 text-sm mt-2">Checking NCCI bundling, MUE limits, and Medicare pricing.</p>
          <button
            onClick={reset}
            className="mt-6 text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ─── Step 5: Results ─── */}
      {step === "results" && analysis && (
        <div className="space-y-6">
          {/* Summary banner */}
          {analysis.savingsFound > 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-5">
              <p className="text-green-800 font-semibold text-lg">
                💰 Potential Savings: ${analysis.savingsFound.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-green-700 mt-1">
                We found issues with your bill. See the flagged items below.
              </p>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
              <h2 className="text-lg font-bold text-gray-800 mb-1">No billing issues detected</h2>
              <p className="text-sm text-gray-600">Your bill looks clean based on our analysis.</p>
            </div>
          )}

          {/* Line item cards */}
          {analysis.lineItems.length > 0 && (
            <div className="space-y-3">
              {analysis.lineItems.map((li) => (
                <div key={li.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-semibold text-sm">
                      CPT {li.cptCode}
                    </span>
                    <span className="text-xs text-gray-500">
                      {li.units} unit{li.units !== 1 ? "s" : ""}
                      {li.amountBilled != null && ` · $${li.amountBilled.toLocaleString()}`}
                    </span>
                  </div>

                  {li.medicareRate != null && (
                    <p className="text-xs text-gray-500 mb-2">
                      Medicare rate: ${li.medicareRate.toFixed(2)}
                    </p>
                  )}

                  {li.flags && li.flags.length > 0 ? (
                    <div className="space-y-2">
                      {li.flags.map((f: Flag, i: number) => (
                        <div
                          key={i}
                          className={`rounded-lg p-3 text-sm ${
                            f.type === "bundling"
                              ? "bg-red-50 border border-red-200 text-red-800"
                              : f.type === "mue"
                              ? "bg-amber-50 border border-amber-200 text-amber-800"
                              : "bg-orange-50 border border-orange-200 text-orange-800"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-xs uppercase">
                              {f.type === "bundling" ? "🔗 NCCI Bundling" :
                               f.type === "mue" ? "🔢 MUE Limit" :
                               "💲 Price Flag"}
                            </span>
                          </div>
                          <p className="text-xs">{f.detail}</p>
                          {f.type === "mue" && f.maxUnits != null && (
                            <p className="text-xs mt-1 opacity-75">
                              Max units allowed: {f.maxUnits}
                              {f.mai && ` (MAI: ${f.mai})`}
                            </p>
                          )}
                          {f.type === "price" && f.ratio != null && (
                            <p className="text-xs mt-1 opacity-75">
                              Billed {f.ratio.toFixed(1)}× the Medicare rate
                              {f.medicareRate != null && ` ($${f.medicareRate.toFixed(2)})`}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-green-600">✓ No issues found for this line</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {caseId && (
              <button
                onClick={() => navigate(`/cases?selected=${caseId}`)}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                View in My Cases
              </button>
            )}
            <button
              onClick={reset}
              className={`${caseId ? "flex-1" : "w-full"} border border-gray-300 text-gray-700 py-3 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors`}
            >
              Analyze Another Bill
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
