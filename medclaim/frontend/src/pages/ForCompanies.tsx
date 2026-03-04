import { useState, useEffect, useRef } from "react"

/**
 * For Companies page — interactive demo of MedClaim's API & capabilities.
 *
 * Target: HR departments, TPAs, self-insured employers, benefits platforms.
 * Shows a live walkthrough of what the platform can do.
 */

/* ── demo data ── */

const demoBills = [
  { cpt: "27447", desc: "Total knee replacement", units: 1, charge: 58000, icd: "M17.11" },
  { cpt: "27487", desc: "Revision of knee replacement", units: 1, charge: 42000, icd: "T84.04XA" },
  { cpt: "20680", desc: "Hardware removal - deep", units: 2, charge: 8500, icd: "T84.04XA" },
  { cpt: "76000", desc: "Fluoroscopy (up to 1 hr)", units: 3, charge: 4200, icd: "M17.11" },
]

const demoFlags = [
  {
    type: "bundling" as const,
    icon: "🔗",
    title: "NCCI Bundling: 27447 + 20680",
    detail: "Hardware removal (20680) is bundled into total knee replacement (27447). Should not be billed separately.",
    savings: 8500,
  },
  {
    type: "mue" as const,
    icon: "📊",
    title: "MUE Limit: 76000 — 3 units billed, max 1",
    detail: "Fluoroscopy (76000) has a Medicare MUE limit of 1 per day. 2 excess units billed.",
    savings: 2800,
  },
  {
    type: "pricing" as const,
    icon: "💰",
    title: "Overpriced: 27447 — $58,000 vs $1,612 Medicare",
    detail: "Charge is 36× the Medicare rate. This is typical of hospital chargemaster abuse.",
    savings: 56388,
  },
]

const steps = [
  {
    id: "upload",
    title: "Upload Bills",
    description: "Drop in an EOB, UB-04, or itemized bill. Our OCR extracts every CPT code, ICD-10, charge, and unit automatically.",
    icon: "📄",
  },
  {
    id: "analyze",
    title: "Automated Analysis",
    description: "We cross-reference every line against NCCI bundling edits, MUE unit limits, Medicare fee schedules, and LCD coverage rules.",
    icon: "🔍",
  },
  {
    id: "flag",
    title: "Flag Issues",
    description: "Bundling errors, excessive units, price gouging, and coverage denials — all caught automatically with citations.",
    icon: "🚩",
  },
  {
    id: "dispute",
    title: "Generate Disputes",
    description: "One-click dispute letters with CMS citations, federal law references, and calculated savings for every flagged item.",
    icon: "📬",
  },
]

const capabilities = [
  { label: "NCCI PTP Bundling", desc: "4.5M+ edit pairs", icon: "🔗" },
  { label: "MUE Unit Limits", desc: "30K+ CPT limits", icon: "📊" },
  { label: "Medicare Fee Schedule", desc: "19K+ RVU rates", icon: "💲" },
  { label: "GPCI Localities", desc: "119 pricing regions", icon: "🗺️" },
  { label: "LCD Coverage", desc: "1,700+ determinations", icon: "📋" },
  { label: "OCR Document Intake", desc: "PDF/image support", icon: "📸" },
]

const useCases = [
  {
    title: "Self-Insured Employers",
    desc: "Audit every medical bill before payment. Catch bundling errors and chargemaster abuse that TPAs miss.",
    icon: "🏢",
  },
  {
    title: "Benefits Consultants",
    desc: "Offer bill audit as a value-add service. White-label our analysis into your workflow.",
    icon: "📈",
  },
  {
    title: "Health Plans & TPAs",
    desc: "Automate pre-payment review. Reduce overpayments and member balance-billing complaints.",
    icon: "🏥",
  },
  {
    title: "Legal Firms",
    desc: "Quantify medical billing overcharges for litigation. Every flag comes with CMS citations.",
    icon: "⚖️",
  },
]

/* ── interactive demo component ── */

function InteractiveDemo() {
  const [phase, setPhase] = useState<"idle" | "scanning" | "analyzing" | "done">("idle")
  const [scanLine, setScanLine] = useState(0)
  const [flagIdx, setFlagIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  function startDemo() {
    setPhase("scanning")
    setScanLine(0)
    setFlagIdx(0)
  }

  function resetDemo() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPhase("idle")
    setScanLine(0)
    setFlagIdx(0)
  }

  // scanning animation
  useEffect(() => {
    if (phase !== "scanning") return
    if (scanLine < demoBills.length) {
      timerRef.current = setTimeout(() => setScanLine(s => s + 1), 700)
    } else {
      timerRef.current = setTimeout(() => setPhase("analyzing"), 400)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [phase, scanLine])

  // analyzing animation
  useEffect(() => {
    if (phase !== "analyzing") return
    if (flagIdx < demoFlags.length) {
      timerRef.current = setTimeout(() => setFlagIdx(i => i + 1), 900)
    } else {
      timerRef.current = setTimeout(() => setPhase("done"), 500)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [phase, flagIdx])

  const totalSavings = demoFlags.reduce((sum, f) => sum + f.savings, 0)
  const visibleFlags = demoFlags.slice(0, flagIdx)
  const runningSavings = visibleFlags.reduce((sum, f) => sum + f.savings, 0)

  return (
    <div className="bg-gray-900 rounded-2xl p-6 text-white overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <div className="w-3 h-3 rounded-full bg-yellow-500" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
        <span className="ml-3 text-xs text-gray-400 font-mono">medclaim-analysis</span>
        <div className="flex-1" />
        {phase !== "idle" && (
          <button onClick={resetDemo} className="text-xs text-gray-500 hover:text-gray-300">
            Reset
          </button>
        )}
      </div>

      {/* Idle state */}
      {phase === "idle" && (
        <div className="text-center py-8">
          <p className="text-gray-400 text-sm mb-4">Click to see MedClaim analyze a sample bill</p>
          <button
            onClick={startDemo}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors"
          >
            ▶ Run Demo Analysis
          </button>
        </div>
      )}

      {/* Bill table */}
      {phase !== "idle" && (
        <div className="space-y-4">
          {/* Scanning phase */}
          <div>
            <div className="text-xs text-blue-400 font-mono mb-2">
              {phase === "scanning" ? "⏳ Extracting line items…" : "✓ 4 line items extracted"}
            </div>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-1 pr-3">CPT</th>
                  <th className="text-left py-1 pr-3">Description</th>
                  <th className="text-right py-1 pr-3">Units</th>
                  <th className="text-right py-1">Charge</th>
                </tr>
              </thead>
              <tbody>
                {demoBills.map((bill, i) => (
                  <tr
                    key={bill.cpt}
                    className={`border-b border-gray-800 transition-all duration-300 ${
                      i < scanLine ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <td className="py-1.5 pr-3 text-green-400">{bill.cpt}</td>
                    <td className="py-1.5 pr-3 text-gray-300">{bill.desc}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-300">{bill.units}</td>
                    <td className="py-1.5 text-right text-yellow-300">${bill.charge.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Analysis phase */}
          {(phase === "analyzing" || phase === "done") && (
            <div>
              <div className="text-xs text-yellow-400 font-mono mb-2">
                {phase === "analyzing" ? "⏳ Cross-referencing CMS databases…" : `✓ ${demoFlags.length} issues found`}
              </div>
              <div className="space-y-2">
                {visibleFlags.map((flag, i) => (
                  <div
                    key={i}
                    className={`rounded-lg p-3 border transition-all duration-500 ${
                      flag.type === "bundling"
                        ? "bg-orange-950/50 border-orange-700"
                        : flag.type === "mue"
                          ? "bg-purple-950/50 border-purple-700"
                          : "bg-red-950/50 border-red-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{flag.icon}</span>
                      <span className="text-sm font-semibold">{flag.title}</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-1">{flag.detail}</p>
                    <div className="text-xs font-semibold text-green-400">
                      Potential savings: ${flag.savings.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          {phase === "done" && (
            <div className="border-t border-gray-700 pt-4 mt-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-400">
                  Total bill: <span className="text-white font-semibold">
                    ${demoBills.reduce((s, b) => s + b.charge * b.units, 0).toLocaleString()}
                  </span>
                </div>
                <div className="text-lg font-bold text-green-400">
                  Savings identified: ${totalSavings.toLocaleString()}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Every flag includes CMS citation, federal law reference, and dispute letter template.
              </p>
            </div>
          )}

          {/* Running counter while analyzing */}
          {phase === "analyzing" && runningSavings > 0 && (
            <div className="text-right text-sm text-green-400 font-mono">
              Running savings: ${runningSavings.toLocaleString()}…
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── main page ── */

export default function ForCompanies() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-3">
          Automate Medical Bill Auditing
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          MedClaim catches billing errors that cost your organization thousands per claim —
          bundling abuse, excessive units, chargemaster gouging, and improper denials.
        </p>
      </div>

      {/* Interactive demo */}
      <div className="mb-16">
        <h2 className="text-xl font-semibold text-center mb-2">See It In Action</h2>
        <p className="text-center text-sm text-gray-500 mb-6">
          Watch our engine analyze a sample orthopedic bill in real time
        </p>
        <div className="max-w-3xl mx-auto">
          <InteractiveDemo />
        </div>
      </div>

      {/* How it works */}
      <div className="mb-16">
        <h2 className="text-xl font-semibold text-center mb-8">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <div key={step.id} className="relative">
              <div className="bg-white border rounded-xl p-5 text-center h-full">
                <div className="text-3xl mb-3">{step.icon}</div>
                <h3 className="font-semibold mb-1">{step.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{step.description}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-1/2 -right-3 text-gray-300 text-lg">→</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Capabilities grid */}
      <div className="mb-16">
        <h2 className="text-xl font-semibold text-center mb-2">What We Cover</h2>
        <p className="text-center text-sm text-gray-500 mb-8">
          Backed by the same CMS databases that Medicare uses to adjudicate claims
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {capabilities.map(cap => (
            <div key={cap.label} className="border rounded-lg p-4 bg-white">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{cap.icon}</span>
                <span className="font-semibold text-sm">{cap.label}</span>
              </div>
              <p className="text-xs text-gray-500">{cap.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Use cases */}
      <div className="mb-16">
        <h2 className="text-xl font-semibold text-center mb-8">Who It's For</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {useCases.map(uc => (
            <div key={uc.title} className="border rounded-xl p-6 bg-white flex gap-4">
              <span className="text-3xl">{uc.icon}</span>
              <div>
                <h3 className="font-semibold mb-1">{uc.title}</h3>
                <p className="text-sm text-gray-600">{uc.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ROI pitch */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8 mb-16 text-center">
        <h2 className="text-2xl font-bold text-blue-900 mb-2">The Numbers</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div>
            <div className="text-3xl font-bold text-blue-700">$67,688</div>
            <p className="text-sm text-blue-600 mt-1">Avg savings found per 100 bills audited</p>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-700">&lt; 30s</div>
            <p className="text-sm text-blue-600 mt-1">Average analysis time per bill</p>
          </div>
          <div>
            <div className="text-3xl font-bold text-blue-700">100%</div>
            <p className="text-sm text-blue-600 mt-1">CMS-sourced data — no guesswork</p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold mb-3">Ready to stop overpaying?</h2>
        <p className="text-sm text-gray-600 mb-6 max-w-xl mx-auto">
          Whether you're auditing 10 bills a month or 10,000, MedClaim scales with you.
          API access, batch processing, and white-label options available.
        </p>
        <div className="flex items-center justify-center gap-4">
          <a
            href="mailto:enterprise@medclaim.app"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Request a Demo
          </a>
          <a
            href="mailto:enterprise@medclaim.app"
            className="border border-blue-600 text-blue-600 px-6 py-3 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
          >
            Contact Sales
          </a>
        </div>
      </div>
    </div>
  )
}
