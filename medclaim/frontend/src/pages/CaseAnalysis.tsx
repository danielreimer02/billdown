/**
 * CaseAnalysis — /cases/:id/analysis
 *
 * Two-panel layout:
 *   Left  – analysis results (line items with flags)
 *   Right – dispute guidance (how to address each issue politely, legally, informed)
 */

import { useState, useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import { documentsApi } from "@/lib/api"
import type { AnalysisResponse, Flag } from "@/types"

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  return fallback
}

// ─────────────────── dispute guidance per flag type ───────────────────

function getDisputeGuidance(flag: Flag, cptCode: string): {
  title: string
  legalBasis: string
  whatToSay: string
  tips: string[]
} {
  if (flag.type === "bundling") {
    return {
      title: "NCCI Bundling Violation",
      legalBasis:
        `Under CMS's National Correct Coding Initiative (NCCI), CPT ${flag.cpt1 ?? ""} ` +
        `is a comprehensive code that includes CPT ${cptCode} as a component procedure. ` +
        `Billing both separately (unbundling) violates 42 C.F.R. § 414.40 and CMS Transmittal 1996.`,
      whatToSay:
        `"I've reviewed my itemized bill and noticed that CPT ${cptCode} was billed separately ` +
        `from CPT ${flag.cpt1 ?? "the comprehensive code"}. According to CMS's NCCI edits, ` +
        `these procedures are bundled — the component code should not be billed independently ` +
        `when performed in the same session. I respectfully request that this charge be removed ` +
        `and my account adjusted accordingly."`,
      tips: [
        "Reference the specific NCCI edit pair in your letter.",
        `Modifier indicator: ${flag.modifierInd === "1" ? "A modifier MAY override this edit — ask if one was applied." : "No modifier can override this bundling edit."}`,
        "If they claim a modifier was used, ask for documentation justifying the separate procedure.",
        "CMS publishes NCCI edits quarterly — cite the effective date for your service.",
      ],
    }
  }

  if (flag.type === "mue") {
    return {
      title: "Medically Unlikely Edit (MUE) Violation",
      legalBasis:
        `CMS's Medically Unlikely Edits (MUE) program sets CPT ${cptCode} at a maximum of ` +
        `${flag.maxUnits ?? "N/A"} unit(s) per day per patient. ` +
        `Billing more units than the MUE value is presumptively incorrect per ` +
        `CMS Pub 100-04, Chapter 12, Section 20.9.`,
      whatToSay:
        `"My bill shows more units of CPT ${cptCode} than CMS considers medically likely ` +
        `for a single encounter. The MUE limit for this code is ${flag.maxUnits ?? "N/A"} unit(s). ` +
        `Unless there is documented medical necessity supporting the additional units, ` +
        `I respectfully request that the excess units be removed and my balance adjusted."`,
      tips: [
        `MAI (MUE Adjudication Indicator): ${flag.mai ?? "N/A"} — ${
          flag.mai === "1" ? "Line-level edit (each line capped)." :
          flag.mai === "2" ? "Day-level edit (total units per day capped)." :
          flag.mai === "3" ? "Date of service edit (absolute cap)." : "Check CMS documentation."
        }`,
        "Ask the provider to justify the units with medical records if they dispute your request.",
        "Hospitals sometimes bill multiple units in error from their chargemaster system.",
      ],
    }
  }

  // price flag
  return {
    title: "Excessive Pricing",
    legalBasis:
      `The charge for CPT ${cptCode} is ${flag.ratio?.toFixed(1) ?? "significantly"}× ` +
      `the Medicare allowable rate of $${flag.medicareRate?.toFixed(2) ?? "N/A"}. ` +
      `While hospitals are not required to charge Medicare rates to uninsured patients, ` +
      `many state consumer protection laws and the Hospital Price Transparency Rule ` +
      `(45 C.F.R. § 180) require good-faith pricing. Excessive markups may also be ` +
      `challengeable under state unfair trade practices statutes.`,
    whatToSay:
      `"I've compared the charge for CPT ${cptCode} on my bill ($${
        flag.medicareRate && flag.ratio
          ? (flag.medicareRate * flag.ratio).toLocaleString(undefined, { maximumFractionDigits: 0 })
          : "N/A"
      }) to the Medicare fee schedule rate ($${flag.medicareRate?.toFixed(2) ?? "N/A"}). ` +
      `The charge appears to be ${flag.ratio?.toFixed(1) ?? ""}× the Medicare rate. ` +
      `I respectfully request an itemized explanation for this pricing and would like to ` +
      `discuss a fair adjustment, perhaps based on a reasonable multiple of the Medicare rate."`,
    tips: [
      "Many hospitals will negotiate to 2–3× Medicare when asked politely.",
      "Reference the hospital's published price transparency file if available.",
      "For uninsured patients, ask about financial assistance or self-pay discounts FIRST.",
      "If insured, your EOB should show the allowed amount — compare to the billed charge.",
      "Some states cap charges for emergency services to a multiple of Medicare (e.g., CO, TX).",
    ],
  }
}

// ─────────────────── component ───────────────────

export default function CaseAnalysis() {
  const { id: caseId } = useParams<{ id: string }>()
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLineItemId, setSelectedLineItemId] = useState<string | null>(null)

  useEffect(() => {
    if (!caseId) return
    setLoading(true)
    documentsApi
      .analysis(caseId)
      .then((res) => {
        setAnalysis(res)
        // Auto-select first item that has flags
        const firstFlagged = res.lineItems.find((li) => li.flags.length > 0)
        if (firstFlagged) setSelectedLineItemId(firstFlagged.id)
        else if (res.lineItems.length > 0) setSelectedLineItemId(res.lineItems[0].id)
      })
      .catch((e) => setError(errMsg(e, "Failed to load analysis")))
      .finally(() => setLoading(false))
  }, [caseId])

  if (!caseId) return <p className="p-8">No case ID</p>

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !analysis) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <Link to={`/cases/${caseId}`} className="text-sm text-gray-500 hover:text-gray-700 mb-4 block">
          ← Back to Case
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          {error ?? "No analysis data available. Please confirm your codes and run the analysis first."}
        </div>
      </div>
    )
  }

  const selectedItem = analysis.lineItems.find((li) => li.id === selectedLineItemId)
  const flaggedItems = analysis.lineItems.filter((li) => li.flags.length > 0)
  const cleanItems = analysis.lineItems.filter((li) => li.flags.length === 0)

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Link to={`/cases/${caseId}`} className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to Case
          </Link>
          <h1 className="text-lg font-semibold">Full Analysis & Dispute Guide</h1>
        </div>
        {analysis.savingsFound > 0 && (
          <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold">
            💰 ${analysis.savingsFound.toLocaleString()} potential savings
          </div>
        )}
      </div>

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — Analysis Results */}
        <div className="w-1/2 border-r overflow-y-auto">
          <div className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Line Items — {flaggedItems.length} issue{flaggedItems.length !== 1 ? "s" : ""} found
            </h2>

            {/* Flagged items first */}
            {flaggedItems.length > 0 && (
              <div className="space-y-3">
                {flaggedItems.map((li) => (
                  <button
                    key={li.id}
                    onClick={() => setSelectedLineItemId(li.id)}
                    className={`w-full text-left border rounded-lg p-4 transition-colors ${
                      selectedLineItemId === li.id
                        ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-semibold text-sm">CPT {li.cptCode}</span>
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
                    <div className="flex flex-wrap gap-1.5">
                      {li.flags.map((flag, i) => (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            flag.type === "bundling"
                              ? "bg-red-100 text-red-700"
                              : flag.type === "mue"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {flag.type === "bundling" ? "🔗 Bundling" : flag.type === "mue" ? "🔢 MUE" : "💲 Price"}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Clean items */}
            {cleanItems.length > 0 && (
              <>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4">
                  ✓ No Issues ({cleanItems.length})
                </h3>
                <div className="space-y-2">
                  {cleanItems.map((li) => (
                    <div
                      key={li.id}
                      className="border border-gray-100 rounded-lg p-3 text-sm text-gray-500"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono">CPT {li.cptCode}</span>
                        <span className="text-xs">
                          {li.units} unit{li.units !== 1 ? "s" : ""}
                          {li.amountBilled != null && ` · $${li.amountBilled.toLocaleString()}`}
                        </span>
                      </div>
                      {li.medicareRate != null && (
                        <p className="text-xs mt-1">Medicare: ${li.medicareRate.toFixed(2)}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right — Dispute Guidance */}
        <div className="w-1/2 overflow-y-auto bg-gray-50">
          <div className="p-6">
            {selectedItem && selectedItem.flags.length > 0 ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Dispute Guidance
                  </h2>
                  <p className="text-lg font-semibold">CPT {selectedItem.cptCode}</p>
                  {selectedItem.amountBilled != null && (
                    <p className="text-sm text-gray-500">Billed: ${selectedItem.amountBilled.toLocaleString()}</p>
                  )}
                </div>

                {selectedItem.flags.map((flag, i) => {
                  const guidance = getDisputeGuidance(flag, selectedItem.cptCode)
                  return (
                    <div key={i} className="bg-white border rounded-lg p-5 space-y-4">
                      <h3
                        className={`text-sm font-bold uppercase ${
                          flag.type === "bundling"
                            ? "text-red-700"
                            : flag.type === "mue"
                            ? "text-amber-700"
                            : "text-orange-700"
                        }`}
                      >
                        {guidance.title}
                      </h3>

                      {/* What happened */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">What happened</p>
                        <p className="text-sm text-gray-700">{flag.detail}</p>
                      </div>

                      {/* Legal basis */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Legal basis</p>
                        <p className="text-sm text-gray-700">{guidance.legalBasis}</p>
                      </div>

                      {/* What to say */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">What to say</p>
                        <blockquote className="text-sm text-gray-800 bg-blue-50 border-l-4 border-blue-400 p-3 rounded-r-lg italic">
                          {guidance.whatToSay}
                        </blockquote>
                      </div>

                      {/* Tips */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Tips</p>
                        <ul className="text-sm text-gray-700 space-y-1">
                          {guidance.tips.map((tip, j) => (
                            <li key={j} className="flex items-start gap-2">
                              <span className="text-blue-500 mt-0.5">•</span>
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )
                })}

                {/* General advice */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-blue-800 mb-2">📝 General Tips</p>
                  <ul className="text-xs text-blue-700 space-y-1">
                    <li>• Always be polite and respectful — billing staff can be your greatest allies.</li>
                    <li>• Put everything in writing. Phone calls should be followed up with a letter or email.</li>
                    <li>• Reference specific CPT codes, dates of service, and dollar amounts.</li>
                    <li>• Ask for an itemized bill if you haven't received one — it's your right under federal law.</li>
                    <li>• Keep copies of everything and note who you spoke with and when.</li>
                    <li>• If the hospital won't budge, mention filing a complaint with your state Attorney General or insurance commissioner.</li>
                  </ul>
                </div>
              </div>
            ) : selectedItem ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-lg mb-1">✅</p>
                <p className="text-sm">No issues found for CPT {selectedItem.cptCode}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Select a flagged line item on the left for dispute guidance.
                </p>
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <p className="text-sm">Select a line item on the left for details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
