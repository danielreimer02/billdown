import { useState, useEffect, useRef } from "react"
import { Link } from "react-router-dom"

/**
 * ForIndividuals — /individuals
 *
 * Product demo page showing individuals what MedClaim can do:
 *  1. Review Your Bill — animated demo of bill analysis (bundling, MUE, pricing flags)
 *  2. Fight a Denial — animated demo of prior auth / denial appeal workflow
 *  3. Generate Letters — preview of auto-generated dispute & records request letters
 *  4. Clear CTAs to get started
 */

// ── Demo: Review Your Bill ──

interface DemoBillLine {
  cpt: string
  desc: string
  units: number
  charge: number
  medicare: number
  flags: Array<{ type: "bundling" | "mue" | "price"; label: string; color: string; saving: number }>
}

const demoBillLines: DemoBillLine[] = [
  {
    cpt: "27447",
    desc: "Total Knee Arthroplasty",
    units: 1,
    charge: 58_000,
    medicare: 17_400,
    flags: [
      { type: "price", label: "3.3× Medicare rate", color: "text-orange-700 bg-orange-50 border-orange-200", saving: 14_500 },
    ],
  },
  {
    cpt: "20610",
    desc: "Joint Injection — Aspiration",
    units: 1,
    charge: 1_200,
    medicare: 108,
    flags: [
      { type: "bundling", label: "Bundled with 27447", color: "text-red-700 bg-red-50 border-red-200", saving: 1_200 },
    ],
  },
  {
    cpt: "99213",
    desc: "Office Visit — Established Patient",
    units: 3,
    charge: 750,
    medicare: 110,
    flags: [
      { type: "mue", label: "MUE limit: 1 unit/day", color: "text-purple-700 bg-purple-50 border-purple-200", saving: 500 },
    ],
  },
  {
    cpt: "36415",
    desc: "Venipuncture (Blood Draw)",
    units: 1,
    charge: 85,
    medicare: 3,
    flags: [
      { type: "price", label: "28× Medicare rate", color: "text-orange-700 bg-orange-50 border-orange-200", saving: 70 },
    ],
  },
  {
    cpt: "99232",
    desc: "Hospital Visit — Subsequent",
    units: 2,
    charge: 900,
    medicare: 115,
    flags: [],
  },
]

function BillReviewDemo() {
  const [phase, setPhase] = useState<"idle" | "scanning" | "done">("idle")
  const [scanIdx, setScanIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  function start() {
    setPhase("scanning")
    setScanIdx(0)
  }

  function reset() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPhase("idle")
    setScanIdx(0)
  }

  useEffect(() => {
    if (phase !== "scanning") return
    if (scanIdx < demoBillLines.length) {
      timerRef.current = setTimeout(() => setScanIdx(i => i + 1), 700)
    } else {
      timerRef.current = setTimeout(() => setPhase("done"), 400)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [phase, scanIdx])

  const totalBilled = demoBillLines.reduce((s, l) => s + l.charge, 0)
  const totalSavings = demoBillLines.flatMap(l => l.flags).reduce((s, f) => s + f.saving, 0)
  const flagCount = demoBillLines.filter(l => l.flags.length > 0).length

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-b">
        <div>
          <h3 className="font-semibold text-sm">Sample Itemized Bill — Knee Surgery</h3>
          <p className="text-xs text-gray-500">5 line items · Total billed: ${totalBilled.toLocaleString()}</p>
        </div>
        {phase === "idle" && (
          <button onClick={start} className="bg-blue-600 text-white text-xs px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
            ▶ Run Analysis
          </button>
        )}
        {phase === "done" && (
          <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700">↻ Reset</button>
        )}
        {phase === "scanning" && (
          <span className="text-xs text-blue-600 animate-pulse">Scanning line {scanIdx + 1} of {demoBillLines.length}…</span>
        )}
      </div>

      <div className="divide-y">
        {demoBillLines.map((line, i) => {
          const revealed = phase === "done" || (phase === "scanning" && i < scanIdx)
          const scanning = phase === "scanning" && i === scanIdx
          return (
            <div
              key={line.cpt}
              className={`px-5 py-3 transition-colors duration-300 ${scanning ? "bg-blue-50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400">{line.cpt}</span>
                    <span className="text-sm font-medium truncate">{line.desc}</span>
                  </div>
                  <span className="text-xs text-gray-500">{line.units} unit{line.units > 1 ? "s" : ""}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">${line.charge.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-400">Medicare: ${line.medicare.toLocaleString()}</div>
                </div>
              </div>

              {/* Flags */}
              {revealed && line.flags.length > 0 && (
                <div className="mt-2 space-y-1 animate-fadeIn">
                  {line.flags.map((f, j) => (
                    <div key={j} className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg border ${f.color}`}>
                      <span className="font-medium">
                        {f.type === "bundling" && "🔗 "}
                        {f.type === "mue" && "📊 "}
                        {f.type === "price" && "💲 "}
                        {f.label}
                      </span>
                      <span className="font-semibold">−${f.saving.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Scanning indicator */}
              {scanning && (
                <div className="mt-2 flex items-center gap-2 text-xs text-blue-600">
                  <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  Checking NCCI edits, MUE limits, and Medicare pricing…
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Summary */}
      {phase === "done" && (
        <div className="bg-green-50 border-t border-green-200 px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-green-800 text-sm">Analysis Complete</h4>
              <p className="text-xs text-green-700 mt-0.5">
                Found <span className="font-bold">{flagCount} issues</span> across {demoBillLines.length} line items
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-green-700">Potential savings</div>
              <div className="text-xl font-bold text-green-800">${totalSavings.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Demo: Fight a Denial ──

interface DenialStep {
  icon: string
  label: string
  detail: string
}

const denialSteps: DenialStep[] = [
  { icon: "📄", label: "Upload your denial letter (EOB)", detail: "We extract the denial reason code (e.g., CO-97 'Bundled Procedure' or CO-236 'No Prior Auth')." },
  { icon: "🔍", label: "We identify the denial code", detail: "CO-236: Procedure denied because prior authorization was not obtained before the service." },
  { icon: "📋", label: "Check LCD coverage rules", detail: "LCD L33543 covers CPT 27447 in Texas. ICD-10 M17.11 is a standalone covered code — no combination required." },
  { icon: "✅", label: "Verify medical necessity", detail: "Your diagnosis (primary osteoarthritis) meets coverage criteria. Conservative treatment documented for 4 months. LCD supports approval." },
  { icon: "📝", label: "Generate appeal letter", detail: "Auto-generated appeal citing LCD coverage, medical necessity, and requesting retro-authorization with supporting documentation." },
  { icon: "📬", label: "Track & follow up", detail: "Case status updated. Follow-up reminders set for 30-day appeal deadline. All documents organized in your case file." },
]

function DenialDemo() {
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle")
  const [step, setStep] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  function start() {
    setPhase("running")
    setStep(0)
  }

  function reset() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPhase("idle")
    setStep(0)
  }

  useEffect(() => {
    if (phase !== "running") return
    if (step < denialSteps.length) {
      timerRef.current = setTimeout(() => setStep(s => s + 1), 1200)
    } else {
      timerRef.current = setTimeout(() => setPhase("done"), 500)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [phase, step])

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-b">
        <div>
          <h3 className="font-semibold text-sm">Prior Auth Denial Appeal — Knee Surgery</h3>
          <p className="text-xs text-gray-500">Denial code CO-236 · CPT 27447 · ICD-10 M17.11</p>
        </div>
        {phase === "idle" && (
          <button onClick={start} className="bg-purple-600 text-white text-xs px-4 py-1.5 rounded-lg hover:bg-purple-700 transition-colors">
            ▶ Start Demo
          </button>
        )}
        {phase === "done" && (
          <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700">↻ Reset</button>
        )}
        {phase === "running" && (
          <span className="text-xs text-purple-600 animate-pulse">Processing step {step + 1} of {denialSteps.length}…</span>
        )}
      </div>

      <div className="p-5 space-y-3">
        {denialSteps.map((s, i) => {
          const active = phase === "running" && i === step
          const done = (phase === "running" && i < step) || phase === "done"
          const pending = !active && !done
          return (
            <div
              key={i}
              className={`flex gap-3 items-start p-3 rounded-lg transition-all duration-500 ${
                active ? "bg-purple-50 border border-purple-200 scale-[1.01]" :
                done ? "bg-green-50 border border-green-100" :
                "bg-gray-50 border border-gray-100 opacity-50"
              }`}
            >
              <div className={`text-2xl shrink-0 transition-transform duration-300 ${active ? "animate-bounce" : ""}`}>
                {done && !active ? "✅" : s.icon}
              </div>
              <div className="min-w-0">
                <h4 className={`text-sm font-medium ${pending ? "text-gray-400" : "text-gray-900"}`}>{s.label}</h4>
                {(active || done) && (
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{s.detail}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {phase === "done" && (
        <div className="bg-green-50 border-t border-green-200 px-5 py-4 flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-green-800 text-sm">Appeal Ready</h4>
            <p className="text-xs text-green-700 mt-0.5">Letter generated with LCD citation, medical necessity documentation, and retro-auth request.</p>
          </div>
          <span className="text-2xl">📬</span>
        </div>
      )}
    </div>
  )
}

// ── Demo: Auto-generated Letters ──

const sampleLetter = `March 4, 2026

To: Memorial Regional Hospital — Billing Department
Re: Formal Billing Dispute

To Whom It May Concern,

I am writing to formally dispute charges on my recent bill. After careful review using the Medicare Physician Fee Schedule and NCCI bundling guidelines, I have identified the following issues:

1. BUNDLING ERROR — CPT 20610 (Joint Injection) was billed separately at $1,200 but is an included component of CPT 27447 (Total Knee Arthroplasty) per NCCI edits. This charge should be removed entirely.

2. EXCESS UNITS — CPT 99213 (Office Visit) was billed for 3 units, but the CMS Medically Unlikely Edit (MUE) limit is 1 unit per day. Two excess units ($500) should be removed.

3. EXCESSIVE PRICING — The charge for CPT 36415 (Blood Draw) is $85, which is 28× the Medicare allowable rate of $3.01. I request a reduction to a fair rate.

Total disputed amount: $16,270

Based on my analysis, I am requesting an adjustment of $16,270. Please review these items and provide a written response within 30 days. I have placed this account on hold pending your review and request that no collections activity be initiated during this time.

I appreciate your prompt attention.

Sincerely,
[Your Name]`

function LetterDemo() {
  const [show, setShow] = useState(false)

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-b">
        <div>
          <h3 className="font-semibold text-sm">Auto-Generated Dispute Letter</h3>
          <p className="text-xs text-gray-500">Based on analysis results above</p>
        </div>
        <button
          onClick={() => setShow(!show)}
          className="text-xs text-blue-600 font-medium hover:underline"
        >
          {show ? "Hide Preview" : "Show Preview"}
        </button>
      </div>
      {show && (
        <div className="p-5 bg-white">
          <pre className="text-xs leading-relaxed text-gray-700 whitespace-pre-wrap font-sans border rounded-lg p-4 bg-gray-50 max-h-80 overflow-y-auto">
            {sampleLetter}
          </pre>
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            This is a sample letter. Real letters are generated from your actual bill data and case details.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Stat cards ──

const stats = [
  { icon: "🧾", number: "$16,270", label: "Average savings found per bill analysis" },
  { icon: "📊", number: "4.5M+", label: "NCCI bundling edits checked per analysis" },
  { icon: "🏥", number: "58,000+", label: "ICD-10 diagnosis codes in our database" },
  { icon: "💲", number: "17,500+", label: "CPT codes with Medicare pricing data" },
]

// ── Main Page ──

export default function ForIndividuals() {
  return (
    <div className="max-w-5xl mx-auto p-8">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold mb-3">
          Stop Overpaying for Healthcare
        </h1>
        <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed">
          MedClaim analyzes your medical bills line-by-line using the same CMS databases that
          Medicare uses. We find billing errors, excessive charges, and denied claims you can
          fight — then generate the letters for you.
        </p>
        <div className="flex items-center justify-center gap-4 mt-6">
          <Link
            to="/cases/new"
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Start Your Free Case →
          </Link>
          <Link
            to="/start"
            className="text-blue-600 text-sm font-medium hover:underline"
          >
            Learn how it works
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {stats.map(s => (
          <div key={s.label} className="text-center p-4 bg-gray-50 rounded-xl">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-xl font-bold text-gray-900">{s.number}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Section 1: Review Your Bill */}
      <section className="mb-14">
        <div className="mb-5">
          <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">DEMO 1</span>
          <h2 className="text-xl font-bold mt-2">Review Your Bill for Errors</h2>
          <p className="text-sm text-gray-600 mt-1 max-w-xl">
            Upload your itemized bill and we scan every line item against CMS's NCCI bundling
            edits (4.5 million rules), Medically Unlikely Edit limits, and the Medicare Physician
            Fee Schedule to find overcharges.
          </p>
        </div>
        <BillReviewDemo />
      </section>

      {/* Section 2: Fight a Denial */}
      <section className="mb-14">
        <div className="mb-5">
          <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full">DEMO 2</span>
          <h2 className="text-xl font-bold mt-2">Fight a Prior Auth Denial</h2>
          <p className="text-sm text-gray-600 mt-1 max-w-xl">
            Got a denial letter? Upload it and we identify the denial reason code, check LCD
            coverage rules for your procedure and diagnosis, verify medical necessity, and
            generate an appeal letter citing the exact coverage determination.
          </p>
        </div>
        <DenialDemo />
      </section>

      {/* Section 3: Auto-generated Letters */}
      <section className="mb-14">
        <div className="mb-5">
          <span className="text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">DEMO 3</span>
          <h2 className="text-xl font-bold mt-2">We Write the Letters for You</h2>
          <p className="text-sm text-gray-600 mt-1 max-w-xl">
            No need to figure out what to say. MedClaim generates professional dispute letters
            citing specific federal regulations, CMS coding edits, and Medicare pricing —
            ready to print and send.
          </p>
        </div>
        <LetterDemo />
      </section>

      {/* What else MedClaim does */}
      <section className="mb-14">
        <h2 className="text-xl font-bold mb-4">What Else MedClaim Does for You</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { icon: "💰", title: "Charity Care Screening", desc: "Check if you qualify to have your entire bill eliminated through the hospital's Financial Assistance Program. Most nonprofit hospitals must write off bills for qualifying patients.", to: "/" },
            { icon: "📋", title: "LCD Coverage Lookup", desc: "Search Local Coverage Determinations to verify your diagnosis supports the procedure — the same data insurance companies use to approve or deny claims.", to: "/lcd" },
            { icon: "🔍", title: "Prior Treatment Requirements", desc: "341 LCDs require documentation of prior conservative treatment before surgery. We flag when your LCD requires this so you can prepare documentation.", to: "/lcd-explorer" },
            { icon: "📖", title: "Insurance Glossary", desc: "Not sure what 'coinsurance' or 'EOB' means? Our plain-English glossary explains every insurance term, why it matters, and how it affects your costs.", to: "/plans/glossary" },
            { icon: "📊", title: "Compare Health Plans", desc: "Add your plan options and compare them side-by-side. Our cost estimator shows which plan actually costs less based on your expected healthcare usage.", to: "/insurance-plans" },
            { icon: "🛡️", title: "Know Your Rights", desc: "Good Faith Estimates, the No Surprises Act, HIPAA record requests, 501(r) financial assistance — we tell you exactly what laws protect you and how to use them.", to: "/start" },
          ].map(item => (
            <Link key={item.title} to={item.to} className="flex gap-3 p-4 border rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group">
              <span className="text-2xl shrink-0">{item.icon}</span>
              <div>
                <h3 className="font-semibold text-sm group-hover:text-blue-600 transition-colors">{item.title}</h3>
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="text-center bg-blue-50 rounded-2xl p-8">
        <h2 className="text-xl font-bold mb-2">Ready to Fight Your Bill?</h2>
        <p className="text-sm text-gray-600 mb-5 max-w-lg mx-auto">
          Create a case, upload your itemized bill, and we'll tell you exactly what's wrong
          and how to dispute it — in minutes, not months.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/cases/new"
            className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Start Your Free Case →
          </Link>
          <Link
            to="/insurance-plans"
            className="inline-block border-2 border-blue-600 text-blue-600 px-8 py-3 rounded-lg font-medium hover:bg-blue-50 transition-colors"
          >
            📊 Compare Insurance Plans
          </Link>
        </div>
      </section>
    </div>
  )
}
