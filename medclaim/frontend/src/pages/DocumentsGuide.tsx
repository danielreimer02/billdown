import { Link } from "react-router-dom"

const DOCUMENTS = [
  {
    name: "Itemized Bill",
    id: "itemized-bill",
    who: "Hospital billing department",
    icon: "🧾",
    why: "This is the single most important document. It lists every CPT/HCPCS code, diagnosis code, and charge — line by line. The summary statement you probably got in the mail after your visit doesn't have enough detail to spot errors — this is the one that does.",
    tip: "Just requesting an itemized bill often causes charges to drop. Hospitals know that once you're looking at the details, they can't pad the bill. It's common for totals to shrink before you even dispute anything.",
    whatToLookFor: [
      "Duplicate charges for the same service",
      "Unbundled charges (procedures billed separately that should be grouped)",
      "Incorrect quantities or units",
      "Charges for services you didn't receive",
    ],
    howToAsk: "Call the billing department and say: \"I'd like a complete itemized bill showing all CPT codes, ICD-10 codes, units, and charges.\" They may offer a summary — that's fine to accept, but it's not the same thing. You need the full itemized version.",
    note: "summary",
  },
  {
    name: "Explanation of Benefits (EOB)",
    id: "eob",
    who: "Your insurance company",
    icon: "📋",
    why: "The EOB shows what was billed, what insurance paid, what was denied, and what you actually owe. Without it, you're trusting the hospital's math.",
    whatToLookFor: [
      "Claims that were denied — check the denial reason codes",
      "The 'allowed amount' vs. what the hospital charged",
      "Whether the provider was in-network or out-of-network",
      "Any cost-sharing amounts (copay, coinsurance, deductible)",
    ],
    howToAsk: "Check your insurer's online portal first (most have them available digitally). If you can't find it, call the member services number on the back of your insurance card and ask for the EOB for all claims from the specific provider and date of service.",
    note: "eob",
  },
  {
    name: "Medical Records",
    id: "medical-records",
    who: "Hospital medical records / HIM department",
    icon: "📁",
    why: "Medical records document what actually happened during your visit — the procedures performed, diagnoses made, and medications given. This lets you verify that the codes on the bill match what was actually done.",
    whatToLookFor: [
      "Whether the diagnosis codes match what the doctor actually said",
      "Whether all billed procedures are documented in the notes",
      "Upcoding — being billed for a more complex procedure than was performed",
    ],
    howToAsk: "Request your records under HIPAA (45 CFR § 164.524). Say: \"I'm requesting access to my Protected Health Information, including complete medical records, physician notes, procedure records, lab results, and imaging for my visit on [date].\" They must respond within 30 days.",
  },
  {
    name: "Financial Assistance Policy (FAP)",
    id: "fap",
    who: "Hospital billing or financial counseling department",
    icon: "💰",
    why: "Every nonprofit hospital is required by federal law (Section 501(r)) to have a FAP. This document tells you the income thresholds for free or reduced-cost care. Many people qualify and don't know it.",
    whatToLookFor: [
      "The income limits (often 200–400% of the Federal Poverty Level)",
      "Whether it covers your type of service",
      "The application form and what documentation you need",
      "The deadline to apply (many hospitals accept applications even after billing)",
    ],
    howToAsk: "Ask the billing department: \"Can you send me a copy of your Financial Assistance Policy and the application form?\" They are legally required to provide it.",
  },
  {
    name: "Summary / Statement",
    id: "summary",
    who: "Hospital billing department",
    icon: "📄",
    why: "This is the bill you probably already got in the mail shortly after your visit — it's usually the first thing that arrives. It shows the total amount due but not the detail behind it. It's useful to compare against the itemized bill to make sure the totals match.",
    whatToLookFor: [
      "The total amount — does it match the itemized bill?",
      "Payment deadlines and collection timelines",
      "Any payments or adjustments already applied",
    ],
    howToAsk: "You almost certainly already have this — it's the bill that shows up in your mailbox a few weeks after your appointment. If you can't find it, call billing and ask for a copy of your most recent statement.",
  },
]

export default function DocumentsGuide() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Documents You Should Request</h1>
        <p className="text-gray-600">
          Most people don't know these exist or that they can ask for them. Here's what can help,
          who to ask, and what to look for.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 text-sm text-gray-700">
        <strong>Tip:</strong> You don't need all of these at once. Start with the <strong>itemized bill</strong> and <strong>EOB</strong> — those
        two alone can reveal most billing errors. When you{" "}
        <Link to="/cases" className="text-blue-600 hover:underline font-medium">submit your case</Link>,
        we'll tell you exactly which documents are still missing — and we'll draft letters requesting them for you.
      </div>

      <div className="space-y-6">
        {DOCUMENTS.map((doc) => (
          <div key={doc.name} id={doc.id} className="border rounded-lg overflow-hidden scroll-mt-24">
            <div className="p-5">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl">{doc.icon}</span>
                <div>
                  <h2 className="font-bold text-lg">{doc.name}</h2>
                  <p className="text-sm text-gray-500">Request from: <strong>{doc.who}</strong></p>
                </div>
              </div>

              <p className="text-sm text-gray-700 mb-4">{doc.why}</p>

              {doc.tip && (
                <div className="bg-green-50 border border-green-200 rounded p-3 mb-4">
                  <p className="text-sm text-gray-700">💡 <strong>Tip:</strong> {doc.tip}</p>
                </div>
              )}

              {doc.note === "summary" && (
                <p className="text-sm text-gray-500 italic mb-4">
                  Not sure what the difference is? The <a href="#summary" className="text-blue-600 hover:underline">summary/statement</a> is the bill you probably already got in the mail after your visit. The itemized bill is much more detailed — and it's the one you need to find errors.
                </p>
              )}

              {doc.note === "eob" && (
                <p className="text-sm text-gray-500 italic mb-4">
                  Your insurance company usually mails an EOB automatically after a claim is processed — but it can take several weeks and people often throw it away thinking it's junk mail.
                </p>
              )}

              <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">What to look for</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  {doc.whatToLookFor.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">→</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">How to ask</h3>
                <p className="text-sm text-gray-700">{doc.howToAsk}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center">
        <p className="text-gray-600 mb-4">Have your documents ready?</p>
        <Link
          to="/cases"
          className="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Submit my case for review →
        </Link>
      </div>
    </div>
  )
}
