import { useState, useEffect, useRef } from "react"

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]

const DOC_TYPES = [
  { value: "itemized_bill", label: "Itemized Bill" },
  { value: "summary_bill", label: "Summary / Statement" },
  { value: "eob", label: "Explanation of Benefits (EOB)" },
  { value: "medical_record", label: "Medical Record" },
  { value: "authorized_rep", label: "Authorized Representative Form" },
  { value: "other", label: "Other" },
] as const

type DocType = typeof DOC_TYPES[number]["value"]

interface CaseDocument {
  id: string
  type: DocType
  fileName: string
  size: number
  addedAt: string
  /** Runtime-only — not persisted */
  objectUrl?: string
}

interface LocalCase {
  id: string
  state: string
  provider: string
  totalBilled: number | null
  householdSize: number | null
  annualIncome: number | null
  documents: CaseDocument[]
  status: "pending" | "analyzing" | "reviewed"
  feedback: string | null
  createdAt: string
}

function loadCases(): LocalCase[] {
  try {
    const raw = JSON.parse(localStorage.getItem("medclaim_cases") || "[]")
    // migrate old format
    return raw.map((c: any) => ({
      ...c,
      documents: c.documents ?? (c.fileName ? [{
        id: crypto.randomUUID(),
        type: "itemized_bill" as DocType,
        fileName: c.fileName,
        size: 0,
        addedAt: c.createdAt,
      }] : []),
    }))
  } catch {
    return []
  }
}

function saveCases(cases: LocalCase[]) {
  // Strip objectUrls before saving
  const cleaned = cases.map((c) => ({
    ...c,
    documents: c.documents.map(({ objectUrl: _, ...d }) => d),
  }))
  localStorage.setItem("medclaim_cases", JSON.stringify(cleaned))
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending:   { label: "Pending Review",  color: "bg-yellow-100 text-yellow-800" },
  analyzing: { label: "Analyzing",       color: "bg-blue-100 text-blue-800" },
  reviewed:  { label: "Review Complete", color: "bg-green-100 text-green-800" },
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
  const [cases, setCases] = useState<LocalCase[]>(loadCases)
  const [view, setView] = useState<View>("list")
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  useEffect(() => { saveCases(cases) }, [cases])

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
    setView("new-upload")
  }

  function handleFileSubmit(e: React.FormEvent) {
    e.preventDefault()
    const docs: CaseDocument[] = []
    if (file) {
      docs.push({
        id: crypto.randomUUID(),
        type: "itemized_bill",
        fileName: file.name,
        size: file.size,
        addedAt: new Date().toISOString(),
        objectUrl: URL.createObjectURL(file),
      })
    }
    const newCase: LocalCase = {
      id: crypto.randomUUID(),
      state,
      provider,
      totalBilled: totalBilled ? Number(totalBilled) : null,
      householdSize: householdSize ? Number(householdSize) : null,
      annualIncome: annualIncome ? Number(annualIncome) : null,
      documents: docs,
      status: "pending",
      feedback: null,
      createdAt: new Date().toISOString(),
    }
    setCases((prev) => [newCase, ...prev])
    resetForm()
    setSelectedId(newCase.id)
    setShowHospitalLetter(false)
    setShowInsuranceLetter(false)
    setView("detail")
  }

  function handleAddDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f || !selectedId) return
    const doc: CaseDocument = {
      id: crypto.randomUUID(),
      type: addDocType,
      fileName: f.name,
      size: f.size,
      addedAt: new Date().toISOString(),
      objectUrl: URL.createObjectURL(f),
    }
    setCases((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? { ...c, documents: [...c.documents, doc] }
          : c
      )
    )
    if (uploadRef.current) uploadRef.current.value = ""
  }

  function handleRemoveDocument(docId: string) {
    if (!selectedId) return
    setCases((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? { ...c, documents: c.documents.filter((d) => d.id !== docId) }
          : c
      )
    )
  }

  function handleDelete(id: string) {
    setCases((prev) => prev.filter((c) => c.id !== id))
    if (selectedId === id) {
      setSelectedId(null)
      setView("list")
    }
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
    const sc = statusConfig[selectedCase.status] ?? statusConfig.pending
    const missingDocs = recommendedDocs.filter(
      (r) => !selectedCase.documents.some((d) => d.type === r.type)
    )
    const hospitalLetterText = generateHospitalLetter(selectedCase)
    const insuranceLetterText = generateInsuranceLetter(selectedCase)

    return (
      <div className="max-w-5xl mx-auto p-8">
        <button
          onClick={() => { setView("list"); setShowHospitalLetter(false); setShowInsuranceLetter(false) }}
          className="text-sm text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-1"
        >
          ← Back to cases
        </button>

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
                            {docTypeLabel(doc.type)} · {doc.size > 0 ? `${(doc.size / 1024).toFixed(0)} KB · ` : ""}
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
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
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
                <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                  + Add Document
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
              onClick={() => handleDelete(selectedCase.id)}
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

            {/* Analysis & Feedback */}
            <div className="border rounded-lg p-5">
              <h3 className="font-semibold text-sm mb-3">Analysis & Feedback</h3>
              {selectedCase.feedback ? (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {selectedCase.feedback}
                </p>
              ) : (
                <div className="text-sm text-gray-500">
                  {selectedCase.status === "pending" && (
                    <p>
                      Your bill is in the queue. While you wait, use the letters
                      to request your records from the hospital and insurance.
                      We'll analyze everything for coding errors, bundling violations,
                      overcharges, and charity care eligibility.
                    </p>
                  )}
                  {selectedCase.status === "analyzing" && (
                    <p>We're currently reviewing your bill. You'll see findings here once the analysis is complete.</p>
                  )}
                  {selectedCase.status === "reviewed" && (
                    <p>Analysis complete — detailed findings will appear here.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── New Case: Step 1 — Info ───
  if (view === "new-info") {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <button
          onClick={() => setView("list")}
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
          onClick={() => setView("new-info")}
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
            onClick={() => setView("new-info")}
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

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Submit Bill for Review
          </button>
        </form>
      </div>
    )
  }

  // ─── Case List (default) ───
  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">My Bill Reviews</h1>
        <button
          onClick={() => { resetForm(); setView("new-info") }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          + Review a Bill
        </button>
      </div>

      {cases.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <div className="text-4xl mb-4">📋</div>
          <h2 className="text-lg font-semibold mb-2">No bills reviewed yet</h2>
          <p className="text-gray-500 text-sm mb-6">
            Upload a medical bill and we'll investigate it for errors, overcharges,
            and charity care eligibility.
          </p>
          <button
            onClick={() => { resetForm(); setView("new-info") }}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Review Your First Bill
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => {
            const sc = statusConfig[c.status] ?? statusConfig.pending
            return (
              <button
                key={c.id}
                onClick={() => { setSelectedId(c.id); setView("detail") }}
                className="w-full text-left border rounded-lg p-4 hover:bg-gray-50 transition flex items-center justify-between"
              >
                <div>
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
                </div>
                <div className="text-right shrink-0">
                  {c.totalBilled != null && (
                    <span className="font-semibold text-sm">
                      ${c.totalBilled.toLocaleString()}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}