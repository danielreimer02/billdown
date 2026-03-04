/**
 * CaseCodesEditor — /cases/:id/codes
 *
 * Three-panel layout:
 *   Left   – document list (click to select)
 *   Center – document viewer (iframe / image)
 *   Right  – editable line items for the selected document
 *
 * Supports adding, editing, deleting individual line items, plus
 * a "Confirm & Analyze" button that pushes all items through the
 * existing confirm-codes pipeline.
 */

import { useState, useEffect, useCallback } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { documentsApi, lineItemsApi, BASE_URL } from "@/lib/api"
import type { ExtractedCodesResponse } from "@/types"

// ─────────────────── types ───────────────────

interface Doc {
  id: string
  fileName: string
  documentType: string
  ocrCompleted: boolean
  viewUrl: string
}

interface EditableLineItem {
  id: string
  documentId: string | null
  cptCode: string
  cptDescription: string | null
  icd10Codes: string[]
  units: number
  amountBilled: number | null
  dirty: boolean      // has local edits
  isNew: boolean      // not yet saved
}

// ─────────────────── helpers ───────────────────

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  return fallback
}

// ─────────────────── component ───────────────────

export default function CaseCodesEditor() {
  const { id: caseId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // Data
  const [docs, setDocs] = useState<Doc[]>([])
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([])
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)   // line item id being saved
  const [error, setError] = useState<string | null>(null)
  const [confirmingAll, setConfirmingAll] = useState(false)

  // ─── Fetch docs + line items on mount ───
  useEffect(() => {
    if (!caseId) return
    setLoading(true)
    Promise.all([
      documentsApi.list(caseId),
      documentsApi.extractedCodes(caseId),
    ])
      .then(([docList, codesRes]: [any[], ExtractedCodesResponse]) => {
        const mapped: Doc[] = docList.map((d: any) => ({
          id: d.id,
          fileName: d.fileName,
          documentType: d.documentType,
          ocrCompleted: d.ocrCompleted,
          viewUrl: `${BASE_URL}/api/cases/${caseId}/documents/${d.id}/view`,
        }))
        setDocs(mapped)

        const items: EditableLineItem[] = codesRes.lineItems.map((li) => ({
          id: li.id,
          documentId: li.documentId,
          cptCode: li.cptCode,
          cptDescription: li.cptDescription ?? null,
          icd10Codes: li.icd10Codes,
          units: li.units,
          amountBilled: li.amountBilled,
          dirty: false,
          isNew: false,
        }))
        setLineItems(items)

        // Auto-select first doc
        if (mapped.length > 0) setSelectedDocId(mapped[0].id)
      })
      .catch((e) => setError(errMsg(e, "Failed to load data")))
      .finally(() => setLoading(false))
  }, [caseId])

  // ─── Filtered line items for selected doc ───
  const itemsForDoc = selectedDocId
    ? lineItems.filter((li) => li.documentId === selectedDocId)
    : []

  // Items with no document assigned
  const unassignedItems = lineItems.filter((li) => !li.documentId)

  // ─── Handlers ───

  const updateField = useCallback(
    (itemId: string, field: keyof EditableLineItem, value: any) => {
      setLineItems((prev) =>
        prev.map((li) =>
          li.id === itemId ? { ...li, [field]: value, dirty: true } : li
        )
      )
    },
    []
  )

  const saveItem = useCallback(
    async (item: EditableLineItem) => {
      if (!caseId) return
      setSaving(item.id)
      setError(null)
      try {
        if (item.isNew) {
          const created = await lineItemsApi.create(caseId, {
            documentId: item.documentId ?? undefined,
            cptCode: item.cptCode,
            cptDescription: item.cptDescription ?? undefined,
            icd10Codes: item.icd10Codes,
            units: item.units,
            amountBilled: item.amountBilled,
          })
          setLineItems((prev) =>
            prev.map((li) =>
              li.id === item.id
                ? { ...li, id: created.id, dirty: false, isNew: false }
                : li
            )
          )
        } else {
          await lineItemsApi.update(caseId, item.id, {
            cptCode: item.cptCode,
            cptDescription: item.cptDescription ?? undefined,
            icd10Codes: item.icd10Codes,
            units: item.units,
            amountBilled: item.amountBilled,
          })
          setLineItems((prev) =>
            prev.map((li) =>
              li.id === item.id ? { ...li, dirty: false } : li
            )
          )
        }
      } catch (e) {
        setError(errMsg(e, "Failed to save line item"))
      } finally {
        setSaving(null)
      }
    },
    [caseId]
  )

  const deleteItem = useCallback(
    async (item: EditableLineItem) => {
      if (!caseId) return
      if (item.isNew) {
        // Just remove locally
        setLineItems((prev) => prev.filter((li) => li.id !== item.id))
        return
      }
      try {
        await lineItemsApi.delete(caseId, item.id)
        setLineItems((prev) => prev.filter((li) => li.id !== item.id))
      } catch (e) {
        setError(errMsg(e, "Failed to delete line item"))
      }
    },
    [caseId]
  )

  const addNewItem = useCallback(() => {
    const tempId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setLineItems((prev) => [
      ...prev,
      {
        id: tempId,
        documentId: selectedDocId,
        cptCode: "",
        cptDescription: null,
        icd10Codes: [],
        units: 1,
        amountBilled: null,
        dirty: true,
        isNew: true,
      },
    ])
  }, [selectedDocId])

  const confirmAndAnalyze = useCallback(async () => {
    if (!caseId) return
    setConfirmingAll(true)
    setError(null)
    try {
      // Save any unsaved new items first
      const unsaved = lineItems.filter((li) => li.isNew)
      for (const item of unsaved) {
        if (!item.cptCode.trim()) continue
        await lineItemsApi.create(caseId, {
          documentId: item.documentId ?? undefined,
          cptCode: item.cptCode,
          cptDescription: item.cptDescription ?? undefined,
          icd10Codes: item.icd10Codes,
          units: item.units,
          amountBilled: item.amountBilled,
        })
      }
      // Now confirm all
      const allItems = lineItems
        .filter((li) => li.cptCode.trim())
        .map((li) => ({
          id: li.id,
          documentId: li.documentId,
          cptCode: li.cptCode,
          icd10Codes: li.icd10Codes,
          units: li.units,
          amountBilled: li.amountBilled,
        }))
      await documentsApi.confirmCodes(caseId, allItems)
      navigate(`/cases/${caseId}`)
    } catch (e) {
      setError(errMsg(e, "Failed to confirm codes"))
    } finally {
      setConfirmingAll(false)
    }
  }, [caseId, lineItems, navigate])

  // ─── Render ───

  if (!caseId) return <p className="p-8">No case ID</p>

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  const selectedDoc = docs.find((d) => d.id === selectedDocId)

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Link
            to={`/cases/${caseId}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to Case
          </Link>
          <h1 className="text-lg font-semibold">Edit Extracted Codes</h1>
        </div>
        <div className="flex items-center gap-3">
          {error && (
            <span className="text-xs text-red-600 max-w-xs truncate">{error}</span>
          )}
          <button
            onClick={confirmAndAnalyze}
            disabled={confirmingAll || lineItems.filter((li) => li.cptCode.trim()).length === 0}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmingAll ? "Confirming…" : "Confirm & Analyze"}
          </button>
        </div>
      </div>

      {/* Three-panel body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — Document list */}
        <div className="w-56 border-r bg-gray-50 overflow-y-auto shrink-0">
          <div className="p-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Documents ({docs.length})
            </h2>
            <div className="space-y-1">
              {docs.map((doc) => {
                const docItemCount = lineItems.filter(
                  (li) => li.documentId === doc.id
                ).length
                return (
                  <button
                    key={doc.id}
                    onClick={() => setSelectedDocId(doc.id)}
                    className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${
                      selectedDocId === doc.id
                        ? "bg-blue-100 text-blue-900 font-medium"
                        : "hover:bg-gray-100 text-gray-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base shrink-0">📄</span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">
                          {doc.fileName}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {docItemCount} code{docItemCount !== 1 ? "s" : ""}
                          {!doc.ocrCompleted && " · Processing…"}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {unassignedItems.length > 0 && (
              <>
                <hr className="my-2" />
                <button
                  onClick={() => setSelectedDocId(null)}
                  className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${
                    selectedDocId === null
                      ? "bg-amber-100 text-amber-900 font-medium"
                      : "hover:bg-gray-100 text-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base shrink-0">📋</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">Unassigned</p>
                      <p className="text-[10px] text-gray-500">
                        {unassignedItems.length} code
                        {unassignedItems.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Center — Document viewer */}
        <div className="flex-1 bg-gray-100 overflow-hidden flex items-center justify-center">
          {selectedDoc ? (
            <iframe
              key={selectedDoc.id}
              src={selectedDoc.viewUrl}
              className="w-full h-full border-0"
              title={selectedDoc.fileName}
            />
          ) : selectedDocId === null && unassignedItems.length > 0 ? (
            <div className="text-center text-gray-500">
              <p className="text-lg mb-1">📋</p>
              <p className="text-sm">Unassigned line items</p>
              <p className="text-xs text-gray-400">
                These codes are not linked to a specific document
              </p>
            </div>
          ) : (
            <div className="text-center text-gray-400">
              <p className="text-lg mb-1">📄</p>
              <p className="text-sm">Select a document to view</p>
            </div>
          )}
        </div>

        {/* Right — Editable codes */}
        <div className="w-96 border-l bg-white overflow-y-auto shrink-0">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">
                {selectedDoc
                  ? `Codes · ${selectedDoc.fileName}`
                  : selectedDocId === null
                  ? "Unassigned Codes"
                  : "Codes"}
              </h2>
              <button
                onClick={addNewItem}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                + Add Line
              </button>
            </div>

            {(selectedDocId !== null ? itemsForDoc : unassignedItems).length ===
            0 ? (
              <p className="text-xs text-gray-400 py-8 text-center">
                No codes extracted.{" "}
                <button
                  onClick={addNewItem}
                  className="text-blue-600 hover:underline"
                >
                  Add one
                </button>
              </p>
            ) : (
              <div className="space-y-3">
                {(selectedDocId !== null ? itemsForDoc : unassignedItems).map(
                  (item, idx) => (
                    <LineItemCard
                      key={item.id}
                      item={item}
                      index={idx}
                      saving={saving === item.id}
                      onUpdate={updateField}
                      onSave={saveItem}
                      onDelete={deleteItem}
                    />
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────── Line Item Card ───────────────────

function LineItemCard({
  item,
  index,
  saving,
  onUpdate,
  onSave,
  onDelete,
}: {
  item: EditableLineItem
  index: number
  saving: boolean
  onUpdate: (id: string, field: keyof EditableLineItem, value: any) => void
  onSave: (item: EditableLineItem) => void
  onDelete: (item: EditableLineItem) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div
      className={`border rounded-lg p-3 text-sm ${
        item.isNew
          ? "border-blue-300 bg-blue-50/50"
          : item.dirty
          ? "border-amber-300 bg-amber-50/30"
          : "border-gray-200"
      }`}
    >
      {/* Row header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-medium">
          Line {index + 1}
          {item.isNew && (
            <span className="ml-1 text-blue-600 font-normal">(new)</span>
          )}
          {item.dirty && !item.isNew && (
            <span className="ml-1 text-amber-600 font-normal">(edited)</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {item.dirty && (
            <button
              onClick={() => onSave(item)}
              disabled={saving || !item.cptCode.trim()}
              className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40 px-1.5 py-0.5 rounded hover:bg-blue-50"
            >
              {saving ? "…" : "Save"}
            </button>
          )}
          {confirmDelete ? (
            <span className="flex items-center gap-1 text-xs">
              <button
                onClick={() => {
                  onDelete(item)
                  setConfirmDelete(false)
                }}
                className="text-red-600 hover:text-red-800 font-medium px-1"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-gray-500 hover:text-gray-700 px-1"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-gray-400 hover:text-red-500 transition-colors p-0.5"
              title="Delete line item"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* CPT Code + Description */}
      <div className="grid grid-cols-[100px_1fr] gap-2 mb-2">
        <div>
          <label className="text-[10px] text-gray-500 uppercase">CPT</label>
          <input
            type="text"
            value={item.cptCode}
            onChange={(e) => onUpdate(item.id, "cptCode", e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm font-mono"
            placeholder="27447"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 uppercase">Description</label>
          <input
            type="text"
            value={item.cptDescription ?? ""}
            onChange={(e) =>
              onUpdate(item.id, "cptDescription", e.target.value || null)
            }
            className="w-full border rounded px-2 py-1 text-sm"
            placeholder="Arthroplasty, knee..."
          />
        </div>
      </div>

      {/* Units + Amount */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="text-[10px] text-gray-500 uppercase">Units</label>
          <input
            type="number"
            min={1}
            value={item.units}
            onChange={(e) =>
              onUpdate(item.id, "units", parseInt(e.target.value) || 1)
            }
            className="w-full border rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 uppercase">
            Amount Billed
          </label>
          <input
            type="number"
            step="0.01"
            value={item.amountBilled ?? ""}
            onChange={(e) =>
              onUpdate(
                item.id,
                "amountBilled",
                e.target.value ? parseFloat(e.target.value) : null
              )
            }
            className="w-full border rounded px-2 py-1 text-sm"
            placeholder="0.00"
          />
        </div>
      </div>

      {/* ICD-10 Codes */}
      <div>
        <label className="text-[10px] text-gray-500 uppercase">
          ICD-10 Codes (comma-separated)
        </label>
        <input
          type="text"
          value={item.icd10Codes.join(", ")}
          onChange={(e) =>
            onUpdate(
              item.id,
              "icd10Codes",
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          className="w-full border rounded px-2 py-1 text-sm font-mono"
          placeholder="M17.11, M17.12"
        />
      </div>
    </div>
  )
}
