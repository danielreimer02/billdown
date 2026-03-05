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

const BASE_URL = import.meta.env.VITE_API_URL ?? ""
export { BASE_URL }

// ─────────────────────────────────────────
// GUEST ID  — localStorage, sent as X-Guest-ID header
// ─────────────────────────────────────────

const GUEST_ID_KEY = "mc_guest_id"

export function getGuestId(): string | null {
  return localStorage.getItem(GUEST_ID_KEY)
}

export function ensureGuestId(): string {
  let id = localStorage.getItem(GUEST_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(GUEST_ID_KEY, id)
  }
  return id
}

export function clearGuestId() {
  localStorage.removeItem(GUEST_ID_KEY)
}

// ─────────────────────────────────────────
// HTTP HELPER
// ─────────────────────────────────────────

function guestHeaders(): Record<string, string> {
  const gid = getGuestId()
  return gid ? { "X-Guest-ID": gid } : {}
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("mc_token")

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : guestHeaders()),
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
  list: (type?: CaseType) => {
    const params = new URLSearchParams()
    if (type) params.set("type", type)
    const qs = params.toString()
    return request<Case[]>(`/api/cases/${qs ? `?${qs}` : ""}`)
  },

  get: (id: string) =>
    request<Case>(`/api/cases/${id}`),

  create: (payload: {
    caseType?: CaseType
    state?: string
    locality?: string
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
        locality: payload.locality,
        household_size: payload.householdSize,
        annual_income: payload.annualIncome,
        provider_name: payload.providerName,
        total_billed: payload.totalBilled,
        total_paid: payload.totalPaid,
      }),
    }),

  update: (id: string, payload: {
    state?: string
    locality?: string
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
        ...(payload.locality !== undefined && { locality: payload.locality }),
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
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : guestHeaders()),
        },
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
      documentId?: string | null
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
// LINE ITEMS (individual CRUD)
// ─────────────────────────────────────────

export interface LineItemPayload {
  id: string
  documentId: string | null
  cptCode: string
  cptDescription: string | null
  icd10Codes: string[]
  units: number
  amountBilled: number | null
  userConfirmed: boolean
}

export const lineItemsApi = {
  create: (caseId: string, payload: {
    documentId?: string
    cptCode: string
    cptDescription?: string
    icd10Codes?: string[]
    units?: number
    amountBilled?: number | null
  }) =>
    request<LineItemPayload>(`/api/cases/${caseId}/line-items`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (caseId: string, lineItemId: string, payload: {
    cptCode?: string
    cptDescription?: string
    icd10Codes?: string[]
    units?: number
    amountBilled?: number | null
  }) =>
    request<LineItemPayload>(`/api/cases/${caseId}/line-items/${lineItemId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  delete: (caseId: string, lineItemId: string) =>
    request<{ status: string; lineItemId: string }>(
      `/api/cases/${caseId}/line-items/${lineItemId}`,
      { method: "DELETE" }
    ),
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

  /** Look up CMS description for a CPT/HCPCS code */
  cptDescription: (cpt: string) =>
    request<{
      cptCode: string
      description: string | null
      statusCode?: string
      workRvu?: number
      nonfacPeRvu?: number
      facilityPeRvu?: number
      mpRvu?: number
      nonfacTotal?: number
      facilityTotal?: number
      message: string
    }>(`/api/billing/cpt-description?cpt=${encodeURIComponent(cpt)}`),

  /** Look up description for an ICD-10 code */
  icd10Description: (icd10: string) =>
    request<{
      icd10Code: string
      description: string | null
      message: string
    }>(`/api/billing/icd10-description?icd10=${encodeURIComponent(icd10)}`),
}


// ─────────────────────────────────────────
// BILLING EXPLORERS — browse CMS datasets
// ─────────────────────────────────────────

export const mueExplorerApi = {
  browse: (params?: { search?: string; setting?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set("search", params.search)
    if (params?.setting) qs.set("setting", params.setting)
    if (params?.page) qs.set("page", String(params.page))
    if (params?.pageSize) qs.set("page_size", String(params.pageSize))
    return request<{
      total: number; page: number; pageSize: number; totalPages: number
      rows: Array<{
        cptCode: string; mueValue: number; setting: string; mai: string
        rationale: string; effectiveDate: string | null; description: string | null
      }>
    }>(`/api/billing/explorer/mue?${qs.toString()}`)
  },
}

export const pfsExplorerApi = {
  browse: (params?: { search?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set("search", params.search)
    if (params?.page) qs.set("page", String(params.page))
    if (params?.pageSize) qs.set("page_size", String(params.pageSize))
    return request<{
      total: number; page: number; pageSize: number; totalPages: number
      rows: Array<{
        hcpcs: string; description: string; statusCode: string
        workRvu: number; nonfacPeRvu: number; facilityPeRvu: number; mpRvu: number
        nonfacTotal: number; facilityTotal: number; convFactor: number
      }>
    }>(`/api/billing/explorer/pfs?${qs.toString()}`)
  },
}

export const ptpExplorerApi = {
  browse: (params?: { search?: string; setting?: string; activeOnly?: boolean; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set("search", params.search)
    if (params?.setting) qs.set("setting", params.setting)
    if (params?.activeOnly !== undefined) qs.set("active_only", String(params.activeOnly))
    if (params?.page) qs.set("page", String(params.page))
    if (params?.pageSize) qs.set("page_size", String(params.pageSize))
    return request<{
      total: number; page: number; pageSize: number; totalPages: number
      rows: Array<{
        column1Cpt: string; column2Cpt: string; setting: string
        effectiveDate: string | null; deletionDate: string | null
        modifierInd: string; rationale: string
        desc1: string | null; desc2: string | null
      }>
    }>(`/api/billing/explorer/ptp?${qs.toString()}`)
  },
}

export const icd10ExplorerApi = {
  browse: (params?: { search?: string; chapter?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set("search", params.search)
    if (params?.chapter) qs.set("chapter", params.chapter)
    if (params?.page) qs.set("page", String(params.page))
    if (params?.pageSize) qs.set("page_size", String(params.pageSize))
    return request<{
      total: number; page: number; pageSize: number; totalPages: number
      chapters: Array<{ letter: string; count: number }>
      rows: Array<{ code: string; description: string | null }>
    }>(`/api/billing/explorer/icd10?${qs.toString()}`)
  },
}

export const cptExplorerApi = {
  browse: (params?: { search?: string; rangeStart?: string; rangeEnd?: string; status?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set("search", params.search)
    if (params?.rangeStart) qs.set("range_start", params.rangeStart)
    if (params?.rangeEnd) qs.set("range_end", params.rangeEnd)
    if (params?.status) qs.set("status", params.status)
    if (params?.page) qs.set("page", String(params.page))
    if (params?.pageSize) qs.set("page_size", String(params.pageSize))
    return request<{
      total: number; page: number; pageSize: number; totalPages: number
      ranges: Array<{ range: string; count: number }>
      rows: Array<{
        code: string; description: string | null; statusCode: string | null
        workRvu: number | null; nonfacPeRvu: number | null; facilityPeRvu: number | null
        mpRvu: number | null; nonfacTotal: number | null; facilityTotal: number | null
        convFactor: number | null
      }>
    }>(`/api/billing/explorer/cpt?${qs.toString()}`)
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


// ─────────────────────────────────────────
// LCD EXPLORER
// ─────────────────────────────────────────

export const lcdExplorerApi = {
  /** Browse LCDs with search and pagination */
  lcds: (params?: { search?: string; status?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set("search", params.search)
    if (params?.status) qs.set("status", params.status)
    if (params?.page) qs.set("page", String(params.page))
    if (params?.pageSize) qs.set("page_size", String(params.pageSize))
    return request<{
      total: number; page: number; pageSize: number; totalPages: number
      lcds: Array<{
        lcdId: number; version: number; title: string; status: string
        displayId: string; determinationNumber: string; lastUpdated: string | null
      }>
    }>(`/api/lcd/explorer/lcds?${qs.toString()}`)
  },

  /** Get LCD detail by ID */
  lcdDetail: (lcdId: number) =>
    request<{
      lcd: {
        lcdId: number; version: number; title: string; status: string
        displayId: string; determinationNumber: string; lastUpdated: string | null
      }
      articles: Array<{ articleId: number; version: number; title: string; status: string }>
      cptCodes: Array<{ cptCode: string; shortDescription: string; longDescription: string; articleId: number }>
      states: Array<{ abbrev: string; name: string }>
    }>(`/api/lcd/explorer/lcd/${lcdId}`),

  /** Browse articles with search and pagination */
  articles: (params?: { search?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set("search", params.search)
    if (params?.page) qs.set("page", String(params.page))
    if (params?.pageSize) qs.set("page_size", String(params.pageSize))
    return request<{
      total: number; page: number; pageSize: number; totalPages: number
      articles: Array<{
        articleId: number; version: number; title: string; status: string; lastUpdated: string | null
      }>
    }>(`/api/lcd/explorer/articles?${qs.toString()}`)
  },

  /** Get article detail by ID */
  articleDetail: (articleId: number) =>
    request<{
      article: { articleId: number; version: number; title: string; status: string; lastUpdated: string | null }
      cptCodes: Array<{ cptCode: string; shortDescription: string; longDescription: string }>
      coveredCodes: Array<{ icd10Code: string; group: number; description: string }>
      coveredGroups: Array<{ group: number; paragraph: string }>
      noncoveredCodes: Array<{ icd10Code: string; group: number; description: string }>
      linkedLcds: Array<{ lcdId: number; title: string; status: string }>
    }>(`/api/lcd/explorer/article/${articleId}`),
}


// ── Site Config API ──

export interface ConfigEntry {
  id: number
  key: string
  value: unknown
  category: string
  label: string | null
  description: string | null
  updatedAt: string | null
}

export const configApi = {
  list: (category?: string) => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : ""
    return request<ConfigEntry[]>(`/api/config${qs}`)
  },
  categories: () =>
    request<Array<{ category: string; count: number }>>("/api/config/categories"),
  get: (key: string) =>
    request<ConfigEntry>(`/api/config/${encodeURIComponent(key)}`),
  create: (entry: { key: string; value: unknown; category: string; label?: string; description?: string }) =>
    request<{ status: string; key: string }>("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }),
  update: (key: string, data: { value: unknown; label?: string; description?: string }) =>
    request<{ status: string; key: string }>(`/api/config/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  delete: (key: string) =>
    request<{ status: string; key: string }>(`/api/config/${encodeURIComponent(key)}`, {
      method: "DELETE",
    }),
}


// ─────────────────────────────────────────
// INSURANCE PLANS — user-owned
// ─────────────────────────────────────────

export interface InsurancePlanPayload {
  name: string
  carrier?: string | null
  plan_type?: string | null
  metal_tier?: string | null
  member_id?: string | null
  group_number?: string | null
  monthly_premium?: number
  annual_deductible?: number
  family_deductible?: number | null
  oop_max?: number
  family_oop_max?: number | null
  copay_primary?: number
  copay_specialist?: number
  copay_urgent_care?: number
  copay_er?: number
  coinsurance?: number
  rx_generic?: number
  rx_preferred?: number
  rx_specialty?: number | null
  hsa_eligible?: boolean
  telehealth_copay?: number | null
  mental_health_copay?: number | null
  employer_contribution?: number | null
  employee_cost?: number | null
  notes?: string | null
}

export interface InsurancePlanResponse extends InsurancePlanPayload {
  id: string
  created_at: string | null
}

export const insurancePlansApi = {
  list: () =>
    request<InsurancePlanResponse[]>("/api/insurance-plans/"),

  create: (payload: InsurancePlanPayload) =>
    request<InsurancePlanResponse>("/api/insurance-plans/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  get: (id: string) =>
    request<InsurancePlanResponse>(`/api/insurance-plans/${id}`),

  update: (id: string, payload: Partial<InsurancePlanPayload>) =>
    request<InsurancePlanResponse>(`/api/insurance-plans/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  delete: (id: string) =>
    request<void>(`/api/insurance-plans/${id}`, { method: "DELETE" }),

  compare: (ids?: string[]) => {
    const qs = ids?.length ? `?ids=${ids.join(",")}` : ""
    return request<InsurancePlanResponse[]>(`/api/insurance-plans/compare${qs}`)
  },
}


// ─────────────────────────────────────────
// ADMIN API — requires admin JWT
// ─────────────────────────────────────────

export const adminApi = {
  listCases: (params?: { type?: CaseType; status?: string }) => {
    const qs = new URLSearchParams()
    if (params?.type) qs.set("type", params.type)
    if (params?.status) qs.set("status", params.status)
    const q = qs.toString()
    return request<Case[]>(`/api/admin/cases${q ? `?${q}` : ""}`)
  },

  getCase: (id: string) =>
    request<Case>(`/api/admin/cases/${id}`),

  listUsers: (role?: string) => {
    const qs = role ? `?role=${encodeURIComponent(role)}` : ""
    return request<Array<{
      id: string; email: string; full_name: string | null; role: string
      company_name: string | null; npi: string | null
      is_active: boolean; created_at: string | null
    }>>(`/api/admin/users${qs}`)
  },

  getUser: (id: string) =>
    request<{
      id: string; email: string; full_name: string | null; role: string
      company_name: string | null; npi: string | null
      is_active: boolean; created_at: string | null
    }>(`/api/admin/users/${id}`),

  userCases: (userId: string) =>
    request<Case[]>(`/api/admin/users/${userId}/cases`),
}