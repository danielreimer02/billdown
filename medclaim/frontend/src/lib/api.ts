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
  CaseType,
  Document,
  LCDCoverage,
  UploadResponse,
  DocumentType,
  ExtractedCodesResponse,
  ConfirmCodesResponse,
  AnalysisResponse,
} from "@/types"

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000"
export { BASE_URL }

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
    const msg = typeof error.detail === "string"
      ? error.detail
      : Array.isArray(error.detail)
        ? error.detail.map((e: any) => e.msg ?? JSON.stringify(e)).join("; ")
        : `HTTP ${response.status}`
    throw new Error(msg)
  }

  return response.json()
}


// ─────────────────────────────────────────
// CASES
// ─────────────────────────────────────────

export const casesApi = {
  list: (type?: CaseType) =>
    request<Case[]>(`/api/cases/${type ? `?type=${type}` : ""}`),

  get: (id: string) =>
    request<Case>(`/api/cases/${id}`),

  create: (payload: {
    caseType?: CaseType
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
        case_type: payload.caseType ?? "billing",
        state: payload.state,
        household_size: payload.householdSize,
        annual_income: payload.annualIncome,
        provider_name: payload.providerName,
        total_billed: payload.totalBilled,
        total_paid: payload.totalPaid,
      }),
    }),

  update: (id: string, payload: {
    state?: string
    householdSize?: number
    annualIncome?: number
    providerName?: string
    totalBilled?: number
    totalPaid?: number
    notes?: string
  }) =>
    request<Case>(`/api/cases/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...(payload.state !== undefined && { state: payload.state }),
        ...(payload.householdSize !== undefined && { household_size: payload.householdSize }),
        ...(payload.annualIncome !== undefined && { annual_income: payload.annualIncome }),
        ...(payload.providerName !== undefined && { provider_name: payload.providerName }),
        ...(payload.totalBilled !== undefined && { total_billed: payload.totalBilled }),
        ...(payload.totalPaid !== undefined && { total_paid: payload.totalPaid }),
        ...(payload.notes !== undefined && { notes: payload.notes }),
      }),
    }),

  delete: (id: string) =>
    request<void>(`/api/cases/${id}`, { method: "DELETE" }),
}


// ─────────────────────────────────────────
// DOCUMENTS
// ─────────────────────────────────────────

export const documentsApi = {
  list: (caseId: string) =>
    request<Document[]>(`/api/cases/${caseId}/documents`),

  upload: async (
    caseId: string,
    file: File,
    documentType: DocumentType
  ): Promise<UploadResponse> => {
    const token = localStorage.getItem("access_token")
    const formData = new FormData()
    formData.append("file", file)

    const response = await fetch(
      `${BASE_URL}/api/cases/${caseId}/documents/upload?document_type=${documentType}`,
      {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Upload failed" }))
      const msg = typeof error.detail === "string"
        ? error.detail
        : Array.isArray(error.detail)
          ? error.detail.map((e: any) => e.msg ?? JSON.stringify(e)).join("; ")
          : "Upload failed"
      throw new Error(msg)
    }

    return response.json()
  },

  extractedCodes: (caseId: string) =>
    request<ExtractedCodesResponse>(`/api/cases/${caseId}/extracted-codes`),

  confirmCodes: (
    caseId: string,
    lineItems: Array<{
      id?: string
      cptCode: string
      icd10Codes: string[]
      units: number
      amountBilled?: number | null
    }>
  ) =>
    request<ConfirmCodesResponse>(`/api/cases/${caseId}/confirm-codes`, {
      method: "POST",
      body: JSON.stringify({ lineItems }),
    }),

  analysis: (caseId: string) =>
    request<AnalysisResponse>(`/api/cases/${caseId}/analysis`),

  delete: (caseId: string, documentId: string) =>
    request<void>(`/api/cases/${caseId}/documents/${documentId}`, { method: "DELETE" }),
}


// ─────────────────────────────────────────
// BILLING — MANUAL CHECKERS
// ─────────────────────────────────────────

export const billingApi = {
  /** Check if two CPTs are bundled (NCCI PTP edit) */
  ncciCheckPair: (cpt1: string, cpt2: string) =>
    request<{
      cpt1: string
      cpt2: string
      bundled: boolean
      flags: Array<{
        cpt1: string
        cpt2: string
        setting: string
        modifierInd: string
        rationale: string
        detail: string
      }>
      message: string
    }>(`/api/billing/ncci/check-pair?cpt1=${cpt1}&cpt2=${cpt2}`),

  /** Get MUE limit for a CPT code */
  mueCheck: (cpt: string) =>
    request<{
      cptCode: string
      limits: Array<{
        cptCode: string
        mueValue: number
        setting: string
        mai: string
        rationale: string
      }>
      message: string
    }>(`/api/billing/mue/check?cpt=${cpt}`),

  /** List GPCI localities for a state */
  pfsLocalities: (state: string) =>
    request<{
      state: string
      localities: Array<{
        localityNumber: string
        localityName: string
        counties: string
        pwGpci: number
        peGpci: number
        mpGpci: number
      }>
      message: string
    }>(`/api/billing/pfs/localities?state=${state}`),

  /** Get Medicare rate for a CPT code, optionally GPCI-adjusted */
  pfsRate: (cpt: string, state?: string, locality?: string, setting?: string) => {
    const params = new URLSearchParams({ cpt })
    if (state) params.set("state", state)
    if (locality) params.set("locality", locality)
    if (setting) params.set("setting", setting)
    return request<{
      cptCode: string
      rate: {
        cptCode: string
        description: string
        payment: number
        workRvu?: number
        peRvu?: number
        mpRvu?: number
        totalRvu?: number
        gpci?: { pw: number; pe: number; mp: number }
        locality?: string
        convFactor: number
        source: string
      } | null
      message: string
    }>(`/api/billing/pfs/rate?${params.toString()}`)
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

  coveredCodes: (params: {
    cptCode: string
    state: string
  }) =>
    request<{
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
    }>(
      `/api/lcd/covered-codes?cpt_code=${params.cptCode}&state=${params.state}`
    ),

  cptsForDiagnosis: (params: {
    icd10Code: string
    state: string
  }) =>
    request<{
      icd10Code: string
      state: string
      cpts: Array<{
        cptCode: string
        lcdId: string | null
        lcdTitle: string | null
        articleId: string | null
        articleTitle: string | null
        standalone: boolean
        groupNum: number
        ruleType: string
        requiresGroups: number[]
      }>
      message: string
    }>(
      `/api/lcd/cpts-for-diagnosis?icd10_code=${params.icd10Code}&state=${params.state}`
    ),
}
