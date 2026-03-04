import { useState } from "react"
import { Link } from "react-router-dom"

/* ═══════════════════════════════════════════
   STEPS — each has a brief body + optional
   expandable detail (from DocumentsGuide)
   ═══════════════════════════════════════════ */

interface StepDetail {
  who: string
  tip?: string
  italicNote?: string
  whatToLookFor: string[]
  howToAsk: string
}

interface Step {
  number: string
  id: string
  icon: string
  title: string
  body: string
  note?: string
  link?: { to: string; label: string }
  color: "blue" | "green"
  detail?: StepDetail
}

const STEPS: Step[] = [
  {
    number: "1",
    id: "dont-pay",
    icon: "🛑",
    title: "Don't pay yet",
    body: "If you just got a bill, you almost certainly have time. Most hospitals won't send a bill to collections for 90–180 days. You don't need to panic or set up a payment plan today. They're likely trying to put pressure on you to pay right away so you overpay before you know your rights.",
    color: "blue",
  },
  {
    number: "2",
    id: "fap",
    icon: "💰",
    title: "Check if the hospital will write off your bill",
    body: "This is the most important step. If you're uninsured or have a low income, you may qualify to have your entire bill eliminated — not reduced, eliminated. Every nonprofit hospital (which is most of them) is required by federal law to have a Financial Assistance Program. You just have to ask for the application, fill it out, and send it back to them.",
    link: { to: "/#calculator", label: "Check if you qualify →" },
    color: "green",
    detail: {
      who: "Hospital billing or financial counseling department",
      whatToLookFor: [
        "The income limits (often 200–400% of the Federal Poverty Level)",
        "Whether it covers your type of service",
        "The application form and what documentation you need",
        "The deadline to apply (many hospitals accept applications even after billing)",
      ],
      howToAsk:
        'Ask the billing department: "Can you send me a copy of your Financial Assistance Policy and the application form?" They are legally required to provide it.',
    },
  },
  {
    number: "3",
    id: "itemized-bill",
    icon: "🧾",
    title: "Get your itemized bill",
    body: "The bill you got in the mail is probably a summary — it just shows a total or a few line items. That's not enough to know if you were overcharged. Call the billing department and ask for a complete itemized bill with all CPT codes, diagnosis codes, and charges. This is the document that shows exactly what they're billing you for, line by line.",
    note: "Here's something most people don't know: just requesting an itemized bill often causes charges to drop. Hospitals know that once you're looking at the line items, they can't get away with padding. It's common for bills to shrink before you even dispute anything.",
    color: "blue",
    detail: {
      who: "Hospital billing department",
      tip: "Just requesting an itemized bill often causes charges to drop. Hospitals know that once you're looking at the details, they can't pad the bill. It's common for totals to shrink before you even dispute anything.",
      italicNote:
        "Not sure what the difference is? The summary/statement is the bill you probably already got in the mail after your visit. The itemized bill is much more detailed — and it's the one you need to find errors.",
      whatToLookFor: [
        "Duplicate charges for the same service",
        "Unbundled charges (procedures billed separately that should be grouped)",
        "Incorrect quantities or units",
        "Charges for services you didn't receive",
      ],
      howToAsk:
        'Call the billing department and say: "I\'d like a complete itemized bill showing all CPT codes, ICD-10 codes, units, and charges." They may offer a summary — that\'s fine to accept, but it\'s not the same thing. You need the full itemized version.',
    },
  },
  {
    number: "4",
    id: "eob",
    icon: "📋",
    title: "If you have insurance, find your EOB",
    body: "Your insurance company sends you an Explanation of Benefits (EOB) after they process a claim. It shows what they paid, what they didn't, and why. Check your insurer's online portal — most have them available digitally. If you can't find it, call the member services number on the back of your card.",
    note: "If you're uninsured, skip this step.",
    color: "blue",
    detail: {
      who: "Your insurance company",
      italicNote:
        "Your insurance company usually mails an EOB automatically after a claim is processed — but it can take several weeks and people often throw it away thinking it's junk mail.",
      whatToLookFor: [
        "Claims that were denied — check the denial reason codes",
        "The 'allowed amount' vs. what the hospital charged",
        "Whether the provider was in-network or out-of-network",
        "Any cost-sharing amounts (copay, coinsurance, deductible)",
      ],
      howToAsk:
        "Check your insurer's online portal first (most have them available digitally). If you can't find it, call the member services number on the back of your insurance card and ask for the EOB for all claims from the specific provider and date of service.",
    },
  },
  {
    number: "5",
    id: "medical-records",
    icon: "📁",
    title: "Get your medical records",
    body: "Medical records document what actually happened during your visit — the procedures performed, diagnoses made, and medications given. This lets you verify that the codes on the bill match what was actually done.",
    color: "blue",
    detail: {
      who: "Hospital medical records / HIM department",
      whatToLookFor: [
        "Whether the diagnosis codes match what the doctor actually said",
        "Whether all billed procedures are documented in the notes",
        "Upcoding — being billed for a more complex procedure than was performed",
      ],
      howToAsk:
        'Request your records under HIPAA (45 CFR § 164.524). Say: "I\'m requesting access to my Protected Health Information, including complete medical records, physician notes, procedure records, lab results, and imaging for my visit on [date]." They must respond within 30 days.',
    },
  },
  {
    number: "6",
    id: "submit",
    icon: "📤",
    title: "Submit your bill to us",
    body: "Upload whatever documents you have and we'll take it from there. We'll review your bill for errors, check if you qualify for financial assistance, and draft letters to the hospital and your insurance company on your behalf. We'll also tell you if any documents are missing and help you get them.",
    link: { to: "/cases", label: "Submit my bill →" },
    color: "blue",
  },
]

const GLOSSARY = [
  {
    term: "Itemized Bill",
    definition:
      "A detailed breakdown of every charge from your hospital visit — each procedure, medication, supply, and service listed with its billing code and price. This is NOT the summary bill you got in the mail.",
  },
  {
    term: "EOB (Explanation of Benefits)",
    definition:
      "A document from your insurance company that shows what was billed, what they paid, what was denied, and what you owe. It's not a bill — it's more like a receipt from your insurer.",
  },
  {
    term: "FAP (Financial Assistance Policy / Program)",
    definition:
      'A program that nonprofit hospitals are required by law to offer. Depending on your income, it can reduce or completely eliminate your bill. Sometimes called "charity care."',
  },
  {
    term: "FPL (Federal Poverty Level)",
    definition:
      "A number set by the government each year based on household size and income. Hospitals use it to decide who qualifies for financial assistance. For example, 200% FPL for a family of 4 is about $62,400/year.",
  },
  {
    term: "CPT / HCPCS Code",
    definition:
      "The billing codes hospitals use to describe what they did — every procedure, test, and service has a code. These are what appear on your itemized bill. You don't need to understand them — that's what we're here for.",
  },
  {
    term: "Denial / Denied Claim",
    definition:
      "When your insurance company refuses to pay for something. This doesn't necessarily mean you owe it — it might mean the hospital billed it wrong, or you can appeal the decision.",
  },
  {
    term: "Collections",
    definition:
      "When a hospital sends your unpaid bill to a third-party company to collect the debt. This can hurt your credit. But you usually have months before this happens, and many states have laws protecting you.",
  },
  {
    term: "Nonprofit Hospital",
    definition:
      "A hospital that operates as a tax-exempt organization (501(c)(3)). In exchange for not paying taxes, they're required to offer financial assistance. Most major hospitals — including most you've heard of — are nonprofits.",
  },
]

export default function GettingStarted() {
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  const toggleDetail = (id: string) => {
    setExpandedStep(expandedStep === id ? null : id)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold mb-3">Where Do I Start?</h1>
        <p className="text-gray-600 text-lg max-w-xl mx-auto">
          You got a medical bill you can't afford. You're not sure what to do. Here's the simple version.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-10 text-sm text-gray-700 text-center">
        <strong>Tip:</strong> You don't need everything at once. Start with steps 2 and 3 — the FAP application and itemized bill — those alone can eliminate or dramatically reduce most bills.
        When you{" "}
        <Link to="/cases" className="text-blue-600 hover:underline font-medium">submit your case</Link>,
        we'll tell you exactly which documents are still missing — and we'll draft letters requesting them for you.
      </div>

      {/* Steps */}
      <div className="space-y-4 mb-16">
        {STEPS.map((step) => (
          <div
            key={step.number}
            id={step.id}
            className={`rounded-lg border overflow-hidden scroll-mt-24 ${
              step.color === "green"
                ? "bg-green-50 border-green-200"
                : "bg-white border-gray-200"
            }`}
          >
            {/* Step summary — always visible */}
            <div className="p-5">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl">{step.icon}</span>
                <div>
                  <h2 className="font-bold text-lg">
                    <span className="text-gray-400 mr-1">{step.number}.</span> {step.title}
                  </h2>
                </div>
              </div>

              <p className="text-sm text-gray-700 leading-relaxed">{step.body}</p>
              {step.note && (
                <p className="text-sm text-gray-500 italic mt-2">{step.note}</p>
              )}
              <div className="flex items-center gap-4 mt-3">
                {step.link && (
                  <Link
                    to={step.link.to}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {step.link.label}
                  </Link>
                )}
                {step.detail && (
                  <button
                    onClick={() => toggleDetail(step.id)}
                    className="text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  >
                    <span
                      className={`inline-block transition-transform duration-200 ${
                        expandedStep === step.id ? "rotate-90" : ""
                      }`}
                    >
                      ▶
                    </span>
                    {expandedStep === step.id ? "Less detail" : "More detail — what to ask for and what to look for"}
                  </button>
                )}
              </div>
            </div>

            {/* Expanded detail — collapsible */}
            {step.detail && expandedStep === step.id && (
              <div className="border-t px-6 pb-6 pt-4 bg-gray-50/50">
                <p className="text-xs text-gray-500 mb-3">
                  Request from: <strong>{step.detail.who}</strong>
                </p>

                {step.detail.tip && (
                  <div className="bg-green-50 border border-green-200 rounded p-3 mb-4">
                    <p className="text-sm text-gray-700">
                      💡 <strong>Tip:</strong> {step.detail.tip}
                    </p>
                  </div>
                )}

                {step.detail.italicNote && (
                  <p className="text-sm text-gray-500 italic mb-4">
                    {step.detail.italicNote}
                  </p>
                )}

                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    What to look for
                  </h3>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {step.detail.whatToLookFor.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-blue-500 mt-0.5">→</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white rounded-lg p-3 border border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    How to ask
                  </h3>
                  <p className="text-sm text-gray-700">{step.detail.howToAsk}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Glossary */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-center mb-2">
          What Does All This Mean?
        </h2>
        <p className="text-center text-gray-600 mb-8">
          Medical billing is full of jargon. Here's what the important terms actually mean.
        </p>

        <div className="space-y-4">
          {GLOSSARY.map((item) => (
            <div key={item.term} className="border-b border-gray-100 pb-4 last:border-0">
              <dt className="font-semibold text-gray-900 mb-1">{item.term}</dt>
              <dd className="text-sm text-gray-600 leading-relaxed">{item.definition}</dd>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="text-center bg-blue-50 border border-blue-200 rounded-lg p-8">
        <h2 className="text-xl font-bold mb-2">Still not sure?</h2>
        <p className="text-gray-600 mb-4 text-sm">
          That's okay. Upload your bill and whatever documents you have — even if it's just the summary statement.
          We'll figure out the rest.
        </p>
        <Link
          to="/cases"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Submit my bill →
        </Link>
      </div>
    </div>
  )
}
