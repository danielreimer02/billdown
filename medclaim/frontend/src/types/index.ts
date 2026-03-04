// ─────────────────────────────────────────
// CORE MEDICAL TYPES
// These mirror the backend models exactly.
// One source of truth for what a CPT/ICD code looks like.
// ─────────────────────────────────────────

export interface CPTCode {
  code: string          // "27447"
  description: string   // "Arthroplasty, knee, condyle and plateau..."
  medicareRate?: number // CMS published rate
}

export interface ICD10Code {
  code: string          // "M17.11"
  description: string   // "Primary osteoarthritis, right knee"
}

export interface LCDCoverage {
  lcdId: string | null
  title: string | null
  articleId: string | null
  articleTitle: string | null
  cptCode: string
  icd10Code: string
  icd10Description: string | null
  covered: boolean
  coveredIcd10Codes: Array<{ code: string; description: string } | string>
  documentationCriteria: string[]  // becomes checkboxes in physician tool
  medicareRate?: number
}


// ─────────────────────────────────────────
// CASE TYPES
// ─────────────────────────────────────────

export type CaseType =
  | "billing"
  | "prior_auth"
  | "physician"

export type CaseStatus =
  | "uploaded"
  | "ocr_processing"
  | "needs_review"
  | "analyzing"
  | "analyzed"
  | "letters_ready"
  | "disputed"
  | "resolved"
  | "closed"

export type DocumentType =
  | "hospital_bill"
  | "itemized_bill"
  | "summary_bill"
  | "eob"
  | "denial_letter"
  | "medical_record"
  | "authorized_rep"
  | "other"

export type DisputeType =
  | "billing_error"
  | "ncci_violation"
  | "mue_violation"
  | "price_dispute"
  | "charity_care"
  | "prior_auth"

export interface Case {
  id: string
  caseType: CaseType
  status: CaseStatus
  state: string
  providerName?: string
  serviceDate?: string
  totalBilled?: number
  totalPaid?: number
  balanceDue?: number
  savingsFound: number
  savingsAchieved: number
  createdAt: string
}

export interface Document {
  id: string
  caseId: string
  documentType: DocumentType
  fileName: string
  ocrCompleted: boolean
  createdAt: string
}

export interface LineItem {
  id: string
  caseId?: string
  cptCode: string
  cptDescription?: string
  icd10Codes: string[]
  units: number
  amountBilled?: number
  amountAllowed?: number
  amountPaid?: number
  medicareRate?: number
  ncciViolation?: boolean
  mueViolation?: boolean
  userConfirmed?: boolean
  flags: Flag[]
}

export interface Flag {
  type: "bundling" | "mue" | "price"
  detail: string
  // bundling
  cpt1?: string
  modifierInd?: string
  // mue
  maxUnits?: number
  mai?: string
  // price
  medicareRate?: number
  ratio?: number
}

export interface Dispute {
  id: string
  caseId: string
  disputeType: DisputeType
  description: string
  legalBasis: string
  amountDisputed: number
  letterText?: string
  sentAt?: string
  resolvedAt?: string
  amountSaved?: number
}


// ─────────────────────────────────────────
// NCCI / MUE VIOLATIONS
// ─────────────────────────────────────────

export interface NCCIViolation {
  column1Code: string
  column2Code: string
  explanation: string
}

export interface MUEViolation {
  cptCode: string
  unitsBilled: number
  mueLimit: number
  explanation: string
}

export interface BillAnalysis {
  ncciViolations: NCCIViolation[]
  mueViolations: MUEViolation[]
  totalViolations: number
  hasViolations: boolean
}


// ─────────────────────────────────────────
// API RESPONSE TYPES
// ─────────────────────────────────────────

export interface ApiError {
  detail: string
}

export interface UploadResponse {
  documentId: string
  status: "uploaded"
  message: string
}

export interface ExtractedCodesResponse {
  caseId: string
  lineItems: Array<{
    id: string
    cptCode: string
    icd10Codes: string[]
    units: number
    amountBilled: number | null
    userConfirmed: boolean
  }>
}

export interface ConfirmCodesResponse {
  status: "analyzing"
  message: string
}

export interface AnalysisResponse {
  caseId: string
  status: CaseStatus | null
  savingsFound: number
  lineItems: Array<{
    id: string
    cptCode: string
    units: number
    amountBilled: number | null
    medicareRate: number | null
    ncciViolation: boolean | null
    mueViolation: boolean | null
    flags: Flag[]
  }>
}
