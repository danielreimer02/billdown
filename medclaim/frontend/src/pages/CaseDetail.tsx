import { useState, useEffect, useRef } from "react"
import { useParams } from "react-router-dom"
import { casesApi, documentsApi } from "@/lib/api"
import type { Case, Document, DocumentType } from "@/types"

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>()
  const [caseData, setCaseData] = useState<Case | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([
      casesApi.get(id),
      documentsApi.list(id),
    ])
      .then(([c, docs]) => {
        setCaseData(c)
        setDocuments(docs)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !id) return

    setUploading(true)
    try {
      await documentsApi.upload(id, file, "hospital_bill" as DocumentType)
      // Refresh documents
      const docs = await documentsApi.list(id)
      setDocuments(docs)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  if (loading) {
    return <div className="max-w-4xl mx-auto p-8 text-gray-500">Loading case...</div>
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">{error}</div>
      </div>
    )
  }

  if (!caseData) {
    return <div className="max-w-4xl mx-auto p-8 text-gray-500">Case not found.</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">
          {caseData.providerName || "Case"}
        </h1>
        <div className="text-gray-500 text-sm">
          {caseData.state && `${caseData.state} · `}
          Status: {caseData.status} ·
          Created {new Date(caseData.createdAt).toLocaleDateString()}
        </div>
      </div>

      {/* Billing Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Billed", value: caseData.totalBilled, fmt: (v: number) => `$${v.toLocaleString()}` },
          { label: "Total Paid", value: caseData.totalPaid, fmt: (v: number) => `$${v.toLocaleString()}` },
          { label: "Savings Found", value: caseData.savingsFound, fmt: (v: number) => `$${v.toLocaleString()}`, green: true },
          { label: "Balance Due", value: caseData.balanceDue, fmt: (v: number) => `$${v.toLocaleString()}` },
        ].map(({ label, value, fmt, green }) => (
          <div key={label} className="border rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className={`text-lg font-semibold ${green && value ? "text-green-600" : ""}`}>
              {value != null ? fmt(value) : "—"}
            </div>
          </div>
        ))}
      </div>

      {/* Documents */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Documents</h2>
          <label className={`cursor-pointer bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 ${uploading ? "opacity-50" : ""}`}>
            {uploading ? "Uploading..." : "Upload Document"}
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </div>

        {documents.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-8 text-center text-gray-500">
            <div className="text-3xl mb-2">📄</div>
            <p>No documents yet. Upload a bill, EOB, or denial letter.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between border rounded p-3">
                <div>
                  <span className="font-medium">{doc.fileName}</span>
                  <span className="ml-2 text-xs text-gray-500">{doc.documentType}</span>
                </div>
                <div className="text-sm">
                  {doc.ocrCompleted ? (
                    <span className="text-green-600">✓ Processed</span>
                  ) : (
                    <span className="text-yellow-600">⏳ Processing</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}