import { useState, useEffect, useRef, useCallback } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { charityCareData } from "@/data/charityCare"
import { casesApi, documentsApi, BASE_URL } from "@/lib/api"
import type { CaseType, DocumentType, AnalysisResponse, ExtractedCodesResponse } from "@/types"

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]

// FPL calculation (2024 guidelines)
const FPL_BASE = 15060
const FPL_PER_PERSON = 5380
function getFplPercent(income: number, householdSize: number, state?: string): number {
  const size = Math.max(1, householdSize)
  let base = FPL_BASE
  let per = FPL_PER_PERSON
  if (state === "AK") { base = 18810; per = 6730 }
  if (state === "HI") { base = 17310; per = 6190 }
  const fpl = base + per * (size - 1)
  return Math.round((income / fpl) * 100)
}

const DOC_TYPES = [
  { value: "itemized_bill", label: "Itemized Bill" },
  { value: "hospital_bill", label: "Hospital / Facility Bill" },
  { value: "summary_bill", label: "Summary / Statement" },
  { value: "eob", label: "Explanation of Benefits (EOB)" },
  { value: "denial_letter", label: "Denial Letter" },
  { value: "medical_record", label: "Medical Record" },
  { value: "authorized_rep", label: "Authorized Representative Form" },
  { value: "other", label: "Other" },
] as const

type DocType = typeof DOC_TYPES[number]["value"]

interface CaseDocument {
  id: string
  type: string
  fileName: string
  size: number
  addedAt: string
  ocrCompleted?: boolean
  objectUrl?: string
}

interface LocalCase {
  id: string
  caseType: CaseType
  state: string
  provider: string
  totalBilled: number | null
  householdSize: number | null
  annualIncome: number | null
  documents: CaseDocument[]
  status: string
  feedback: string | null
  savingsFound: number
  createdAt: string
}

// Safe error message extraction
function errMsg(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  return fallback
}

// Bridge: convert backend Case → LocalCase shape
function apiCaseToLocal(c: any): LocalCase {
  return {
    id: c.id,
    caseType: c.caseType ?? c.case_type ?? "billing",
    state: c.state || "",
    provider: c.providerName || c.provider_name || "",
    totalBilled: c.totalBilled ?? c.total_billed ?? null,
    householdSize: c.householdSize ?? c.household_size ?? null,
    annualIncome: c.annualIncome ?? c.annual_income ?? null,
    documents: [],
    status: c.status ?? "uploaded",
    feedback: null,
    savingsFound: c.savingsFound ?? c.savings_found ?? 0,
    createdAt: c.createdAt ?? c.created_at ?? new Date().toISOString(),
  }
}

const statusConfig: Record<string, { label: string; color: string }> = {
  uploaded:       { label: "Uploaded",         color: "bg-gray-100 text-gray-700" },
  ocr_processing: { label: "Processing…",     color: "bg-blue-100 text-blue-800" },
  needs_review:   { label: "Needs Review",    color: "bg-amber-100 text-amber-800" },
  analyzing:      { label: "Analyzing…",      color: "bg-blue-100 text-blue-800" },
  analyzed:       { label: "Analysis Ready",  color: "bg-green-100 text-green-800" },
  letters_ready:  { label: "Letters Ready",   color: "bg-green-100 text-green-800" },
  disputed:       { label: "Disputed",        color: "bg-purple-100 text-purple-800" },
  resolved:       { label: "Resolved",        color: "bg-emerald-100 text-emerald-800" },
  closed:         { label: "Closed",          color: "bg-gray-100 text-gray-500" },
}

function docTypeLabel(type: DocType): string {
  return DOC_TYPES.find((d) => d.value === type)?.label ?? type
}

function generateHospitalLetter(c: LocalCase): string {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
  const provider = c.provider || "[Hospital / Provider Name]"
  const billed = c.totalBilled != null ? `$${c.totalBilled.toLocaleString()}` : "[amount]"

  return `${date}

To: ${provider} — Billing Department
Re: Request for Itemized Records & Financial Assistance Information

To Whom It May Concern,

I recently received a bill of ${billed} for services at your facility. Before making any payment, I'd like to request the following so I can better understand and review my charges.

Pursuant to my rights under the HIPAA Privacy Rule (45 CFR § 164.524), I am requesting access to my Protected Health Information (PHI), including complete medical records and billing records for this visit. I understand you are required to fulfill this request within 30 days.

Specifically, I am requesting:

1. ITEMIZED BILL — A complete itemized statement showing every CPT/HCPCS code, ICD-10 diagnosis code, number of units, and the charge for each line item. A summary statement is not sufficient for my review.

2. MEDICAL RECORDS — Complete medical records for this visit, including physician notes, procedure records, lab results, and any imaging reports.

3. FINANCIAL ASSISTANCE POLICY (FAP) — A copy of your facility's Financial Assistance Policy and the application form. Under Section 501(r) of the Internal Revenue Code, nonprofit hospitals are required to provide this information and to screen patients for eligibility before initiating collections.

4. PAYMENT HOLD — I respectfully request that this account be placed on hold and that no collections activity, credit reporting, or extraordinary collection actions be taken while I review these documents and complete the financial assistance application process. Federal regulations (26 CFR § 1.501(r)-6) require reasonable efforts to determine FAP eligibility before pursuing collections.

I appreciate your help and look forward to resolving this.

Sincerely,
[Your Name]
[Your Address]
[Your Phone / Email]`
}

function generateInsuranceLetter(c: LocalCase): string {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
  const provider = c.provider || "[Hospital / Provider Name]"

  return `${date}

To: [Insurance Company Name] — Member Services
Re: Request for Explanation of Benefits (EOB)
Member ID: [Your Member ID]
Group #: [Your Group Number, if applicable]

To Whom It May Concern,

I am writing to request a complete Explanation of Benefits (EOB) for services I received at ${provider}. Specifically, I need:

1. A copy of the EOB for all claims submitted by ${provider} on my behalf, showing:
   - What was billed by the provider
   - What was allowed under my plan
   - What was paid by insurance
   - What was denied and the reason code for each denial
   - My remaining patient responsibility

2. If any claims were denied, I would also like:
   - The specific denial reason codes (e.g., CO-4, CO-97, PR-1)
   - Instructions on how to file an appeal for any denied claims
   - The deadline for filing an appeal

If no claims were submitted by this provider, please confirm that in writing so I can follow up with the provider directly.

Thank you for your assistance.

Sincerely,
[Your Name]
[Your Address]
[Your Member ID]
[Your Phone / Email]`
}

type View = "list" | "new-info" | "new-upload" | "detail"

export default function Cases() {
  const { id: urlCaseId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  // Derive high-level view from URL; wizard sub-steps stay in local state
  const isNewRoute = location.pathname === "/cases/new"
  const [wizardStep, setWizardStep] = useState<"info" | "upload">("info")

  const view: View = urlCaseId
    ? "detail"
    : isNewRoute
      ? (wizardStep === "upload" ? "new-upload" : "new-info")
      : "list"

  const selectedId = urlCaseId ?? null

  const [cases, setCases] = useState<LocalCase[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null)
  const [extractedCodes, setExtractedCodes] = useState<ExtractedCodesResponse | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // New case form state
  const [state, setState] = useState("")
  const [provider, setProvider] = useState("")
  const [totalBilled, setTotalBilled] = useState("")
  const [householdSize, setHouseholdSize] = useState("")
  const [annualIncome, setAnnualIncome] = useState("")
  const [file, setFile] = useState<File | null>(null)

  // Detail view state
  const [showHospitalLetter, setShowHospitalLetter] = useState(false)
  const [showInsuranceLetter, setShowInsuranceLetter] = useState(false)
  const [addDocType, setAddDocType] = useState<DocType>("itemized_bill")
  const [editingInfo, setEditingInfo] = useState(false)
  const [editBilled, setEditBilled] = useState("")
  const [editHousehold, setEditHousehold] = useState("")
  const [editIncome, setEditIncome] = useState("")
  const uploadRef = useRef<HTMLInputElement>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null)

  // ── Fetch case list on mount ──
  const fetchCases = useCallback(async () => {
    try {
      setLoadingList(true)
      const apiCases = await casesApi.list()
      setCases(apiCases.map(apiCaseToLocal))
    } catch (err: any) {
      setError(errMsg(err, "Failed to load cases"))
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { fetchCases() }, [fetchCases])

  // Reset wizard step when leaving /cases/new
  useEffect(() => {
    if (!isNewRoute) setWizardStep("info")
  }, [isNewRoute])

  // ── Poll when status is async-processing ──
  const selectedStatus = cases.find((c) => c.id === selectedId)?.status
  const shouldPoll = !!selectedId && ["uploaded", "ocr_processing", "analyzing"].includes(selectedStatus ?? "")
  const lastPolledStatusRef = useRef<string | null>(null)

  useEffect(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    if (!shouldPoll || !selectedId) return
    // Reset last polled status when starting a new poll cycle
    lastPolledStatusRef.current = null

    pollingRef.current = setInterval(async () => {
      try {
        const updated = await casesApi.get(selectedId)
        const local = apiCaseToLocal(updated)
        const statusChanged = lastPolledStatusRef.current !== null && lastPolledStatusRef.current !== local.status
        lastPolledStatusRef.current = local.status

        // Only re-fetch docs when status transitions (e.g. uploaded → ocr_processing → needs_review)
        // This avoids unnecessary API calls every 3s while status is unchanged
        if (statusChanged) {
          let docs: CaseDocument[] = []
          try {
            const apiDocs = await documentsApi.list(selectedId)
            docs = apiDocs.map((d: any) => ({
              id: d.id,
              type: d.documentType ?? d.document_type ?? "hospital_bill",
              fileName: d.fileName ?? d.file_name ?? "document",
              size: 0,
              addedAt: d.createdAt ?? d.created_at ?? new Date().toISOString(),
              ocrCompleted: d.ocrCompleted ?? d.ocr_completed ?? false,
              objectUrl: d.viewUrl ? `${BASE_URL}${d.viewUrl}` : undefined,
            }))
          } catch { /* keep existing on failure */ }

          setCases((prev) => prev.map((c) => {
            if (c.id !== selectedId) return c
            const finalDocs = docs.length > 0 ? docs : c.documents
            return { ...local, documents: finalDocs }
          }))
        } else {
          // Status unchanged — just update case status, keep existing docs
          setCases((prev) => prev.map((c) => {
            if (c.id !== selectedId) return c
            return { ...local, documents: c.documents }
          }))
        }

        if (!["uploaded", "ocr_processing", "analyzing"].includes(local.status)) {
          if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
        }
      } catch { /* silently retry */ }
    }, 3000)

    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null } }
  }, [selectedId, shouldPoll])

  // ── Fetch extracted codes when needs_review ──
  useEffect(() => {
    if (!selectedId) return
    const sc = cases.find((c) => c.id === selectedId)
    if (sc?.status === "needs_review" && !extractedCodes) {
      documentsApi.extractedCodes(selectedId).then(setExtractedCodes).catch(() => {})
    }
  }, [selectedId, cases, extractedCodes])

  // ── Fetch analysis when analyzed/letters_ready ──
  useEffect(() => {
    if (!selectedId) return
    const sc = cases.find((c) => c.id === selectedId)
    if (sc && ["analyzed", "letters_ready"].includes(sc.status) && !analysisResult) {
      documentsApi.analysis(selectedId).then(setAnalysisResult).catch(() => {})
    }
  }, [selectedId, cases, analysisResult])

  // ── Fetch documents when a case is selected ──
  useEffect(() => {
    if (!selectedId) return
    const sc = cases.find((c) => c.id === selectedId)
    if (sc && sc.documents.length === 0) {
      documentsApi.list(selectedId).then((docs: any[]) => {
        const mapped: CaseDocument[] = docs.map((d: any) => ({
          id: d.id,
          type: d.documentType ?? d.document_type ?? "hospital_bill",
          fileName: d.fileName ?? d.file_name ?? "document",
          size: 0,
          addedAt: d.createdAt ?? d.created_at ?? new Date().toISOString(),
          ocrCompleted: d.ocrCompleted ?? d.ocr_completed ?? false,
          objectUrl: d.viewUrl ? `${BASE_URL}${d.viewUrl}` : undefined,
        }))
        if (mapped.length > 0) {
          setCases((prev) =>
            prev.map((c) => (c.id === selectedId ? { ...c, documents: mapped } : c))
          )
        }
      }).catch(() => {})
    }
  }, [selectedId, cases])

  const selectedCase = cases.find((c) => c.id === selectedId) ?? null

  function resetForm() {
    setState("")
    setProvider("")
    setTotalBilled("")
    setHouseholdSize("")
    setAnnualIncome("")
    setFile(null)
  }

  function startEditingInfo(c: LocalCase) {
    setEditBilled(c.totalBilled != null ? String(c.totalBilled) : "")
    setEditHousehold(c.householdSize != null ? String(c.householdSize) : "")
    setEditIncome(c.annualIncome != null ? String(c.annualIncome) : "")
    setEditingInfo(true)
  }

  function saveEditedInfo() {
    if (!selectedCase) return
    setCases((prev) =>
      prev.map((c) =>
        c.id === selectedCase.id
          ? {
              ...c,
              totalBilled: editBilled ? parseFloat(editBilled) : null,
              householdSize: editHousehold ? parseInt(editHousehold) : null,
              annualIncome: editIncome ? parseFloat(editIncome) : null,
            }
          : c
      )
    )
    setEditingInfo(false)
  }

  function handleInfoSubmit(e: React.FormEvent) {
    e.preventDefault()
    setWizardStep("upload")
  }

  async function handleFileSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      // 1. Create the case on the backend
      const created = await casesApi.create({
        state,
        providerName: provider || undefined,
        totalBilled: totalBilled ? Number(totalBilled) : undefined,
        householdSize: householdSize ? Number(householdSize) : undefined,
        annualIncome: annualIncome ? Number(annualIncome) : undefined,
      })
      const localCase = apiCaseToLocal(created)

      // 2. Upload the first document
      await documentsApi.upload(created.id, file, "hospital_bill" as DocumentType)

      // 3. Refresh documents list for this case
      const docs = await documentsApi.list(created.id)
      localCase.documents = docs.map((d: any) => ({
        id: d.id,
        type: d.documentType ?? d.document_type ?? "hospital_bill",
        fileName: d.fileName ?? d.file_name ?? "document",
        size: 0,
        addedAt: d.createdAt ?? d.created_at ?? new Date().toISOString(),
        ocrCompleted: d.ocrCompleted ?? d.ocr_completed ?? false,
        objectUrl: d.viewUrl ? `${BASE_URL}${d.viewUrl}` : undefined,
      }))

      setCases((prev) => [localCase, ...prev])
      resetForm()
      setShowHospitalLetter(false)
      setShowInsuranceLetter(false)
      setExtractedCodes(null)
      setAnalysisResult(null)
      navigate(`/cases/${localCase.id}`)
    } catch (err: any) {
      setError(errMsg(err, "Failed to create case"))
    } finally {
      setUploading(false)
    }
  }

  async function handleAddDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f || !selectedId) return
    setUploading(true)
    try {
      const resp = await documentsApi.upload(selectedId, f, addDocType as DocumentType)
      const doc: CaseDocument = {
        id: resp.documentId,
        type: addDocType,
        fileName: f.name,
        size: f.size,
        addedAt: new Date().toISOString(),
        objectUrl: `${BASE_URL}/api/cases/${selectedId}/documents/${resp.documentId}/view`,
      }
      // Reset extracted codes and analysis so the review flow re-triggers
      setExtractedCodes(null)
      setAnalysisResult(null)
      setCases((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, documents: [...c.documents, doc], status: "uploaded" }
            : c
        )
      )
    } catch (err: any) {
      setError(errMsg(err, "Upload failed"))
    } finally {
      setUploading(false)
      if (uploadRef.current) uploadRef.current.value = ""
    }
  }

  function handleRemoveDocument(docId: string) {
    setDeleteDocId(docId)
  }

  async function confirmDocDelete() {
    if (!deleteDocId || !selectedId) return
    const docId = deleteDocId
    setDeleteDocId(null)
    // Remove from local state immediately
    setCases((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? { ...c, documents: c.documents.filter((d) => d.id !== docId) }
          : c
      )
    )
    // Delete from backend (best-effort)
    try {
      await documentsApi.delete(selectedId, docId)
    } catch { /* best-effort */ }
  }

  function renderDocDeleteModal() {
    if (!deleteDocId) return null
    const doc = selectedCase?.documents.find((d) => d.id === deleteDocId)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteDocId(null)} />
        <div className="relative bg-white rounded-xl shadow-lg p-6 max-w-sm w-full mx-4">
          <h3 className="text-lg font-semibold mb-2">Remove document?</h3>
          <p className="text-sm text-gray-600 mb-6">
            {doc ? `"${doc.fileName}" will be permanently deleted.` : "This document will be permanently deleted."} This cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeleteDocId(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDocDelete}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )
  }

  async function confirmDelete() {
    if (!deleteConfirmId) return
    const id = deleteConfirmId
    setDeleteConfirmId(null)
    try {
      await casesApi.delete(id)
    } catch { /* best-effort */ }
    setCases((prev) => prev.filter((c) => c.id !== id))
    if (selectedId === id) {
      navigate("/cases")
    }
  }

  function renderDeleteModal() {
    if (!deleteConfirmId) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteConfirmId(null)} />
        <div className="relative bg-white rounded-xl shadow-lg p-6 max-w-sm w-full mx-4">
          <h3 className="text-lg font-semibold mb-2">Delete case?</h3>
          <p className="text-sm text-gray-600 mb-6">
            This will permanently delete this case and all its documents. This cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeleteConfirmId(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )
  }

  function copyLetter(text: string) {
    navigator.clipboard.writeText(text)
  }

  // Which doc types are still missing?
  const recommendedDocs: { type: DocType; why: string }[] = [
    { type: "itemized_bill", why: "Shows every CPT code and charge — needed to find billing errors" },
    { type: "summary_bill", why: "The statement you received — compare against itemized version" },
    { type: "eob", why: "Shows what insurance paid vs. denied — needed if you have coverage" },
    { type: "medical_record", why: "Procedure and diagnosis notes — needed to verify codes match" },
  ]

  // ─── Detail View ───
  if (view === "detail" && selectedCase) {
    const sc = statusConfig[selectedCase.status] ?? statusConfig.uploaded
    const missingDocs = recommendedDocs.filter(
      (r) => !selectedCase.documents.some((d) => d.type === r.type)
    )
    const hospitalLetterText = generateHospitalLetter(selectedCase)
    const insuranceLetterText = generateInsuranceLetter(selectedCase)

    return (
      <>
      <div className="max-w-5xl mx-auto p-8">
        <button
          onClick={() => { navigate("/cases"); setShowHospitalLetter(false); setShowInsuranceLetter(false); setExtractedCodes(null); setAnalysisResult(null) }}
          className="text-sm text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-1"
        >
          ← Back to cases
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs font-bold">✕</button>
          </div>
        )}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">
              {selectedCase.provider || "Unnamed Provider"}
            </h1>
            <p className="text-sm text-gray-500">
              {selectedCase.state} · Submitted{" "}
              {new Date(selectedCase.createdAt).toLocaleDateString()}
            </p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${sc.color}`}>
            {sc.label}
          </span>
        </div>

        {/* ═══ Two-column layout ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* ── LEFT COLUMN: Your stuff ── */}
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Your Information</h2>

            {/* Case Details */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Case Details</h3>
                {!editingInfo && (
                  <button
                    onClick={() => startEditingInfo(selectedCase)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Edit
                  </button>
                )}
              </div>

              {editingInfo ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="border rounded-lg p-3">
                    <label className="text-xs text-gray-500 mb-1 block">Total Billed</label>
                    <div className="flex items-center">
                      <span className="text-sm text-gray-400 mr-1">$</span>
                      <input
                        type="number"
                        value={editBilled}
                        onChange={(e) => setEditBilled(e.target.value)}
                        className="w-full text-sm font-semibold border-b border-gray-300 focus:border-blue-500 outline-none py-0.5 bg-transparent"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <label className="text-xs text-gray-500 mb-1 block">Household Size</label>
                    <input
                      type="number"
                      min="1"
                      value={editHousehold}
                      onChange={(e) => setEditHousehold(e.target.value)}
                      className="w-full text-sm font-semibold border-b border-gray-300 focus:border-blue-500 outline-none py-0.5 bg-transparent"
                      placeholder="1"
                    />
                  </div>
                  <div className="border rounded-lg p-3">
                    <label className="text-xs text-gray-500 mb-1 block">Annual Income</label>
                    <div className="flex items-center">
                      <span className="text-sm text-gray-400 mr-1">$</span>
                      <input
                        type="number"
                        value={editIncome}
                        onChange={(e) => setEditIncome(e.target.value)}
                        className="w-full text-sm font-semibold border-b border-gray-300 focus:border-blue-500 outline-none py-0.5 bg-transparent"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="col-span-3 flex gap-2 mt-1">
                    <button
                      onClick={saveEditedInfo}
                      className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingInfo(false)}
                      className="bg-gray-100 text-gray-700 px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total Billed", value: selectedCase.totalBilled != null ? `$${selectedCase.totalBilled.toLocaleString()}` : "—" },
                    { label: "Household Size", value: selectedCase.householdSize ?? "—" },
                    { label: "Annual Income", value: selectedCase.annualIncome != null ? `$${selectedCase.annualIncome.toLocaleString()}` : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="border rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
                      <div className="font-semibold text-sm">{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Documents */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Documents ({selectedCase.documents.length})</h3>
              </div>

              {selectedCase.documents.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {selectedCase.documents.map((doc) => (
                    <div key={doc.id} className="border rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg shrink-0">📄</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{doc.fileName}</p>
                          <p className="text-xs text-gray-500">
                            {docTypeLabel(doc.type as DocType)} · {doc.size > 0 ? `${(doc.size / 1024).toFixed(0)} KB · ` : ""}
                            {new Date(doc.addedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {doc.objectUrl && (
                          <a
                            href={doc.objectUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                          >
                            View
                          </a>
                        )}
                        <button
                          onClick={() => handleRemoveDocument(doc.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1"
                          title="Remove document"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-6 text-center text-gray-400 text-sm mb-4">
                  No documents uploaded yet
                </div>
              )}

              {/* Add document */}
              <div className="flex items-center gap-2">
                <select
                  value={addDocType}
                  onChange={(e) => setAddDocType(e.target.value as DocType)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {DOC_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
                <label className={`cursor-pointer px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${uploading ? "bg-gray-200 text-gray-400" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}>
                  {uploading ? "Uploading…" : "+ Add Document"}
                  <input
                    ref={uploadRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={handleAddDocument}
                  />
                </label>
              </div>
            </div>

            {/* Recommended documents checklist */}
            {missingDocs.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-6">
                <h3 className="font-semibold text-sm mb-1">Documents you should request</h3>
                <p className="text-xs text-gray-600 mb-3">
                  To fully investigate your bill, try to collect these:
                </p>
                <ul className="space-y-2">
                  {missingDocs.map((r) => (
                    <li key={r.type} className="flex items-start gap-2 text-sm">
                      <span className="text-amber-500 mt-0.5">☐</span>
                      <div>
                        <span className="font-medium">{docTypeLabel(r.type)}</span>
                        <span className="text-gray-500"> — {r.why}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={() => setDeleteConfirmId(selectedCase.id)}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Delete this case
            </button>
          </div>

          {/* ── RIGHT COLUMN: Our output ── */}
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">What We've Prepared</h2>

            {/* Draft Letter to Hospital */}
            <div className="border rounded-lg mb-4">
              <button
                onClick={() => setShowHospitalLetter(!showHospitalLetter)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div>
                  <h3 className="font-semibold text-sm">Draft Letter to Hospital</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Request records, FAP application, and payment hold
                  </p>
                </div>
                <span className="text-gray-400 text-sm">{showHospitalLetter ? "▲" : "▼"}</span>
              </button>
              {showHospitalLetter && (
                <div className="border-t p-4">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 rounded p-4 mb-3 max-h-96 overflow-y-auto">
                    {hospitalLetterText}
                  </pre>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyLetter(hospitalLetterText)}
                      className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      Copy to Clipboard
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([hospitalLetterText], { type: "text/plain" })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement("a")
                        a.href = url
                        a.download = `hospital-letter-${selectedCase.provider || "hospital"}.txt`
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                      className="bg-gray-100 text-gray-700 px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-200 transition-colors"
                    >
                      Download .txt
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Draft Letter to Insurance */}
            <div className="border rounded-lg mb-4">
              <button
                onClick={() => setShowInsuranceLetter(!showInsuranceLetter)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div>
                  <h3 className="font-semibold text-sm">Draft Letter to Insurance</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Request EOB, denial reason codes, and appeal instructions
                  </p>
                </div>
                <span className="text-gray-400 text-sm">{showInsuranceLetter ? "▲" : "▼"}</span>
              </button>
              {showInsuranceLetter && (
                <div className="border-t p-4">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 rounded p-4 mb-3 max-h-96 overflow-y-auto">
                    {insuranceLetterText}
                  </pre>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyLetter(insuranceLetterText)}
                      className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      Copy to Clipboard
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([insuranceLetterText], { type: "text/plain" })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement("a")
                        a.href = url
                        a.download = `insurance-letter-${selectedCase.provider || "provider"}.txt`
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                      className="bg-gray-100 text-gray-700 px-4 py-1.5 rounded text-sm font-medium hover:bg-gray-200 transition-colors"
                    >
                      Download .txt
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Charity Care Eligibility (auto-calculated if income data exists) */}
            {selectedCase.annualIncome != null && selectedCase.householdSize != null && (
              (() => {
                const pct = getFplPercent(selectedCase.annualIncome!, selectedCase.householdSize!, selectedCase.state)
                const stateData = selectedCase.state ? charityCareData[selectedCase.state] : null
                const federalFree = pct <= 200
                const federalReduced = pct <= 400
                const stateFree = stateData?.fplThreshold ? pct <= stateData.fplThreshold : false
                const stateReduced = stateData?.reducedCareThreshold ? pct <= stateData.reducedCareThreshold : false

                return (
                  <div className="border rounded-lg p-5 mb-4">
                    <div className="flex items-baseline justify-between mb-3">
                      <h3 className="font-semibold text-sm">Charity Care Eligibility</h3>
                      <span className="text-lg font-bold text-gray-900">{pct}% FPL</span>
                    </div>

                    <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          pct <= 200 ? "bg-green-400" : pct <= 400 ? "bg-yellow-400" : "bg-red-400"
                        }`}
                        style={{ width: `${Math.min(pct / 5, 100)}%` }}
                      />
                    </div>

                    <div className="space-y-2 text-sm">
                      {federalFree ? (
                        <p className="text-green-700">
                          ✅ <strong>You very likely qualify for free care</strong> at nonprofit hospitals under federal FAP guidelines.
                        </p>
                      ) : federalReduced ? (
                        <p className="text-yellow-700">
                          🟡 <strong>You may qualify for reduced-cost care</strong> at nonprofit hospitals. Many FAPs offer sliding-scale discounts up to 400% FPL.
                        </p>
                      ) : (
                        <p className="text-gray-600">
                          At {pct}% FPL, you're above the typical FAP threshold — but it's still worth applying. Some hospitals have higher limits.
                        </p>
                      )}

                      {stateData && (stateFree || stateReduced) && (
                        <p className="text-green-700">
                          ✅ <strong>{stateData.name} state law</strong> also covers you —
                          {stateFree
                            ? ` free care up to ${stateData.fplThreshold}% FPL.`
                            : ` reduced-cost care up to ${stateData.reducedCareThreshold}% FPL.`}
                          {stateData.hasMandatoryCharityCare && " Applies to all hospitals."}
                        </p>
                      )}

                      <div className="bg-green-50 border border-green-200 rounded p-3 mt-2">
                        <p className="text-gray-700 text-xs">
                          <strong>💡 Tip:</strong> The single most effective thing to do right now is call the hospital's billing department and ask for their Financial Assistance Program (FAP) application. Fill it out and send it back to them — this alone can reduce or eliminate your entire bill.
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })()
            )}

            {/* Code Review (needs_review) */}
            {selectedCase.status === "needs_review" && extractedCodes && (
              <div className="border border-amber-300 bg-amber-50 rounded-lg p-5 mb-4">
                <h3 className="font-semibold text-sm mb-1">📝 Review Extracted Codes</h3>
                <p className="text-xs text-gray-600 mb-4">
                  We pulled these from your bill. Please verify and correct anything that looks wrong, then confirm.
                </p>
                <div className="space-y-3 mb-4">
                  {extractedCodes.lineItems.map((li, idx) => (
                    <div key={li.id} className="bg-white border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-400">Line {idx + 1}</span>
                        {li.userConfirmed && (
                          <span className="text-xs text-green-600 font-medium">✓ Confirmed</span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <label className="text-xs text-gray-500 block">CPT Code</label>
                          <input
                            type="text"
                            value={li.cptCode}
                            onChange={(e) => {
                              const v = e.target.value
                              setExtractedCodes((prev) => prev ? ({
                                ...prev,
                                lineItems: prev.lineItems.map((x) =>
                                  x.id === li.id ? { ...x, cptCode: v } : x
                                ),
                              }) : prev)
                            }}
                            className="w-full border rounded px-2 py-1 text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block">Units</label>
                          <input
                            type="number"
                            min="1"
                            value={li.units}
                            onChange={(e) => {
                              const v = Number(e.target.value)
                              setExtractedCodes((prev) => prev ? ({
                                ...prev,
                                lineItems: prev.lineItems.map((x) =>
                                  x.id === li.id ? { ...x, units: v } : x
                                ),
                              }) : prev)
                            }}
                            className="w-full border rounded px-2 py-1 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block">Billed</label>
                          <input
                            type="number"
                            step="0.01"
                            value={li.amountBilled ?? ""}
                            onChange={(e) => {
                              const v = e.target.value ? Number(e.target.value) : null
                              setExtractedCodes((prev) => prev ? ({
                                ...prev,
                                lineItems: prev.lineItems.map((x) =>
                                  x.id === li.id ? { ...x, amountBilled: v } : x
                                ),
                              }) : prev)
                            }}
                            className="w-full border rounded px-2 py-1 text-sm"
                            placeholder="$0.00"
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        <label className="text-xs text-gray-500 block">ICD-10 Codes</label>
                        <input
                          type="text"
                          value={li.icd10Codes.join(", ")}
                          onChange={(e) => {
                            const v = e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                            setExtractedCodes((prev) => prev ? ({
                              ...prev,
                              lineItems: prev.lineItems.map((x) =>
                                x.id === li.id ? { ...x, icd10Codes: v } : x
                              ),
                            }) : prev)
                          }}
                          className="w-full border rounded px-2 py-1 text-sm font-mono"
                          placeholder="M17.11, Z96.651"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  disabled={confirming}
                  onClick={async () => {
                    if (!extractedCodes) return
                    setConfirming(true)
                    try {
                      await documentsApi.confirmCodes(
                        selectedCase.id,
                        extractedCodes.lineItems.map((li) => ({
                          id: li.id,
                          cptCode: li.cptCode,
                          icd10Codes: li.icd10Codes,
                          units: li.units,
                          amountBilled: li.amountBilled,
                        }))
                      )
                      // Move case to analyzing status locally
                      setCases((prev) =>
                        prev.map((c) =>
                          c.id === selectedCase.id ? { ...c, status: "analyzing" } : c
                        )
                      )
                      setExtractedCodes(null)
                    } catch (err: any) {
                      setError(errMsg(err, "Failed to confirm codes"))
                    } finally {
                      setConfirming(false)
                    }
                  }}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {confirming ? "Submitting…" : "Confirm Codes & Start Analysis"}
                </button>
              </div>
            )}

            {/* Analysis & Feedback */}
            <div className="border rounded-lg p-5">
              <h3 className="font-semibold text-sm mb-3">Analysis & Feedback</h3>

              {/* Show real analysis results */}
              {analysisResult && ["analyzed", "letters_ready"].includes(selectedCase.status) ? (
                <div className="space-y-4">
                  {analysisResult.savingsFound > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-green-800 font-semibold text-lg">
                        💰 Potential Savings: ${analysisResult.savingsFound.toLocaleString()}
                      </p>
                    </div>
                  )}

                  {analysisResult.lineItems.length > 0 ? (
                    <div className="space-y-3">
                      {analysisResult.lineItems.map((li) => (
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

                          {li.flags.length > 0 ? (
                            <div className="space-y-2">
                              {li.flags.map((flag, i) => (
                                <div
                                  key={i}
                                  className={`rounded-lg p-3 text-sm ${
                                    flag.type === "bundling"
                                      ? "bg-red-50 border border-red-200 text-red-800"
                                      : flag.type === "mue"
                                      ? "bg-amber-50 border border-amber-200 text-amber-800"
                                      : "bg-orange-50 border border-orange-200 text-orange-800"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-xs uppercase">
                                      {flag.type === "bundling" ? "🔗 NCCI Bundling" :
                                       flag.type === "mue" ? "🔢 MUE Limit" :
                                       "💲 Price Flag"}
                                    </span>
                                  </div>
                                  <p className="text-xs">{flag.detail}</p>
                                  {flag.type === "mue" && flag.maxUnits != null && (
                                    <p className="text-xs mt-1 opacity-75">
                                      Max units allowed: {flag.maxUnits}
                                      {flag.mai && ` (MAI: ${flag.mai})`}
                                    </p>
                                  )}
                                  {flag.type === "price" && flag.ratio != null && (
                                    <p className="text-xs mt-1 opacity-75">
                                      Billed {flag.ratio.toFixed(1)}× the Medicare rate
                                      {flag.medicareRate != null && ` ($${flag.medicareRate.toFixed(2)})`}
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
                  ) : (
                    <p className="text-sm text-green-700">
                      ✅ No billing issues were detected. Your bill looks clean!
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  {["uploaded", "ocr_processing"].includes(selectedCase.status) && (
                    <div className="flex items-center gap-2">
                      <span className="animate-pulse">⏳</span>
                      <p>
                        Your bill is being processed. While you wait, use the letters
                        to request your records from the hospital and insurance.
                      </p>
                    </div>
                  )}
                  {selectedCase.status === "needs_review" && (
                    <p>👆 Please review the extracted codes above and confirm them to start the analysis.</p>
                  )}
                  {selectedCase.status === "analyzing" && (
                    <div className="flex items-center gap-2">
                      <span className="animate-spin">⚙️</span>
                      <p>We're currently analyzing your bill for coding errors, bundling violations, and overcharges…</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {renderDeleteModal()}
      {renderDocDeleteModal()}
    </>
    )
  }

  // ─── New Case: Step 1 — Info ───
  if (view === "new-info") {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <button
          onClick={() => navigate("/cases")}
          className="text-sm text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-1"
        >
          ← Back to cases
        </button>

        <h1 className="text-2xl font-bold mb-2">Review a New Bill</h1>
        <p className="text-gray-600 mb-8">
          Tell us about your bill. We'll check it for coding errors, overcharges,
          and charity care eligibility.
        </p>

        {/* Progress */}
        <div className="flex items-center gap-3 mb-8 text-sm">
          <div className="flex items-center gap-1.5 text-blue-600 font-semibold">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-blue-600 text-white">1</span>
            Details
          </div>
          <div className="flex-1 h-px bg-gray-200" />
          <div className="flex items-center gap-1.5 text-gray-400">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-gray-200 text-gray-500">2</span>
            Upload
          </div>
        </div>

        <form onSubmit={handleInfoSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              State <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select state...</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hospital / Provider Name
            </label>
            <input
              type="text"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="e.g. Memorial Hermann"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Total Amount Billed
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={totalBilled}
                onChange={(e) => setTotalBilled(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Household Size
              </label>
              <input
                type="number"
                min="1"
                value={householdSize}
                onChange={(e) => setHouseholdSize(e.target.value)}
                placeholder="e.g. 3"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Annual Income
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  value={annualIncome}
                  onChange={(e) => setAnnualIncome(e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Income info is used to check charity care eligibility. We never share your data.
          </p>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Continue →
          </button>
        </form>
      </div>
    )
  }

  // ─── New Case: Step 2 — Upload ───
  if (view === "new-upload") {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <button
          onClick={() => setWizardStep("info")}
          className="text-sm text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-1"
        >
          ← Back to details
        </button>

        <h1 className="text-2xl font-bold mb-8">Upload Your Bill</h1>

        {/* Progress */}
        <div className="flex items-center gap-3 mb-8 text-sm">
          <div className="flex items-center gap-1.5 text-gray-400">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-gray-200 text-gray-500">1</span>
            Details
          </div>
          <div className="flex-1 h-px bg-gray-200" />
          <div className="flex items-center gap-1.5 text-blue-600 font-semibold">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-blue-600 text-white">2</span>
            Upload
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600 space-y-1 mb-6">
          <div><strong>State:</strong> {state}</div>
          {provider && <div><strong>Provider:</strong> {provider}</div>}
          {totalBilled && <div><strong>Billed:</strong> ${Number(totalBilled).toLocaleString()}</div>}
          <button
            type="button"
            onClick={() => setWizardStep("info")}
            className="text-blue-600 hover:underline text-xs mt-1"
          >
            Edit details
          </button>
        </div>

        <form onSubmit={handleFileSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Upload Your Bill <span className="text-red-500">*</span>
            </label>
            <label
              className={`block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                file ? "border-blue-300 bg-blue-50" : "border-gray-300 hover:border-gray-400"
              }`}
            >
              {file ? (
                <div>
                  <div className="text-2xl mb-2">📄</div>
                  <p className="text-sm font-medium text-gray-700">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {(file.size / 1024).toFixed(0)} KB · Click to change
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-3xl mb-2">📤</div>
                  <p className="text-sm text-gray-600">
                    Drop your bill here or <span className="text-blue-600 font-medium">browse</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">PDF, JPG, or PNG</p>
                </div>
              )}
              <input
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs font-bold">✕</button>
            </div>
          )}

          <button
            type="submit"
            disabled={uploading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Submit Bill for Review"}
          </button>
        </form>
      </div>
    )
  }

  // ─── Case List (default) ───
  const billingCases = cases.filter(c => c.caseType === "billing" || !c.caseType)
  const priorAuthCases = cases.filter(c => c.caseType === "prior_auth")
  const physicianCases = cases.filter(c => c.caseType === "physician")

  function renderCaseCard(c: LocalCase) {
    const sc = statusConfig[c.status] ?? statusConfig.uploaded
    return (
      <div
        key={c.id}
        className="w-full text-left border rounded-lg p-4 hover:bg-gray-50 transition flex items-center justify-between group"
      >
        <button
          onClick={() => { setExtractedCodes(null); setAnalysisResult(null); navigate(`/cases/${c.id}`) }}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-sm">
              {c.provider || "Unnamed Provider"}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${sc.color}`}>
              {sc.label}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            {c.state} · {new Date(c.createdAt).toLocaleDateString()}
          </p>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            {c.totalBilled != null && (
              <span className="font-semibold text-sm">
                ${c.totalBilled.toLocaleString()}
              </span>
            )}
            {c.savingsFound > 0 && (
              <p className="text-xs text-green-600 font-medium">
                ${c.savingsFound.toLocaleString()} savings
              </p>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(c.id) }}
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1 rounded"
            title="Delete case"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">My Cases</h1>
      </div>

      {loadingList ? (
        <div className="text-center py-16">
          <p className="text-gray-500 text-sm">Loading your cases…</p>
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <h2 className="text-lg font-semibold mb-2">No cases yet</h2>
          <p className="text-gray-500 text-sm mb-6">
            Upload a medical bill or prior authorization denial and we'll investigate it for errors,
            overcharges, and charity care eligibility.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => { resetForm(); navigate("/cases/new") }}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Review Your First Bill
            </button>
            <button
              onClick={() => { resetForm(); navigate("/cases/new?type=prior_auth") }}
              className="bg-violet-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-violet-700 transition-colors"
            >
              Review a Prior Auth
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left column — Billing disputes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                Billing Disputes
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {billingCases.length}
                </span>
              </h2>
              <button
                onClick={() => { resetForm(); navigate("/cases/new") }}
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                + Bill Review
              </button>
            </div>
            {billingCases.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed rounded-lg">
                <p className="text-sm text-gray-400">No billing cases yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {billingCases.map(renderCaseCard)}
              </div>
            )}
          </div>

          {/* Right column — Prior Auth / Physician cases */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                Prior Authorization Disputes
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {priorAuthCases.length}
                </span>
              </h2>
              <button
                onClick={() => { resetForm(); navigate("/cases/new") }}
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                + Prior Auth
              </button>
            </div>
            {priorAuthCases.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed rounded-lg">
                <p className="text-sm text-gray-400">No prior auth cases yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {priorAuthCases.map(renderCaseCard)}
              </div>
            )}

            {/* Physician cases if any */}
            {physicianCases.length > 0 && (
              <>
                <h2 className="text-lg font-semibold mb-3 mt-8 flex items-center gap-2">
                  Physician
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {physicianCases.length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {physicianCases.map(renderCaseCard)}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {renderDeleteModal()}
      {renderDocDeleteModal()}
    </div>
  )
}