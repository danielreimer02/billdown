/**
 * API client — all calls to the FastAPI backend go through here.
 *
 * Why centralize:
 * - One place to add auth headers
 * - One place to handle errors
 * - Easy to mock in tests
 * - Easy to switch base URL between dev/prod
 */

import type {
  Case,
  Document,
  LCDCoverage,
  BillAnalysis,
  UploadResponse,
  DocumentType,
} from "@/types"

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000"

// ─────────────────────────────────────────
// HTTP HELPER
// ─────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("access_token")

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail ?? `HTTP ${response.status}`)
  }

  return response.json()
}


// ─────────────────────────────────────────
// CASES
// ─────────────────────────────────────────

export const casesApi = {
  list: () =>
    request<Case[]>("/api/cases/"),

  get: (id: string) =>
    request<Case>(`/api/cases/${id}`),

  create: (payload: {
    state: string
    householdSize?: number
    annualIncome?: number
    providerName?: string
    totalBilled?: number
    totalPaid?: number
  }) =>
    request<Case>("/api/cases/", {
      method: "POST",
      body: JSON.stringify({
        state: payload.state,
        household_size: payload.householdSize,
        annual_income: payload.annualIncome,
        provider_name: payload.providerName,
        total_billed: payload.totalBilled,
        total_paid: payload.totalPaid,
      }),
    }),
}


// ─────────────────────────────────────────
// DOCUMENTS
// ─────────────────────────────────────────

export const documentsApi = {
  list: (caseId: string) =>
    request<Document[]>(`/api/documents/${caseId}/documents`),

  upload: async (
    caseId: string,
    file: File,
    documentType: DocumentType
  ): Promise<UploadResponse> => {
    const token = localStorage.getItem("access_token")
    const formData = new FormData()
    formData.append("file", file)

    const response = await fetch(
      `${BASE_URL}/api/documents/${caseId}/upload?document_type=${documentType}`,
      {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        // Note: don't set Content-Type header with FormData
        // browser sets it automatically with boundary
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail ?? "Upload failed")
    }

    return response.json()
  },
}


// ─────────────────────────────────────────
// LCD LOOKUP
// ─────────────────────────────────────────

export const lcdApi = {
  lookup: (params: {
    cptCode: string
    icd10Code: string
    state: string
  }) =>
    request<LCDCoverage & { message: string }>(
      `/api/lcd/lookup?cpt_code=${params.cptCode}&icd10_code=${params.icd10Code}&state=${params.state}`
    ),
}
