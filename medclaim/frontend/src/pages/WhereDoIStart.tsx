import { Link } from "react-router-dom"

const STEPS = [
  {
    number: "1",
    title: "Don't pay yet",
    body: "If you just got a bill, you almost certainly have time. Most hospitals won't send a bill to collections for 90–180 days. You don't need to panic or set up a payment plan today.",
    color: "blue",
  },
  {
    number: "2",
    title: "Check if the hospital will write off your bill",
    body: "This is the most important step. If you're uninsured or have a low income, you may qualify to have your entire bill eliminated — not reduced, eliminated. Every nonprofit hospital (which is most of them) is required by federal law to have a Financial Assistance Program. You just have to ask for the application, fill it out, and send it back.",
    link: { to: "/#calculator", label: "Check if you qualify →" },
    color: "green",
  },
  {
    number: "3",
    title: "Get your itemized bill",
    body: "The bill you got in the mail is probably a summary — it just shows a total or a few line items. That's not enough to know if you were overcharged. Call the billing department and ask for a complete itemized bill with all CPT codes, diagnosis codes, and charges. This is the document that shows exactly what they're billing you for, line by line.",
    note: "Here's something most people don't know: just requesting an itemized bill often causes charges to drop. Hospitals know that once you're looking at the line items, they can't get away with padding. It's common for bills to shrink before you even dispute anything.",
    color: "blue",
  },
  {
    number: "4",
    title: "If you have insurance, find your EOB",
    body: "Your insurance company sends you an Explanation of Benefits (EOB) after they process a claim. It shows what they paid, what they didn't, and why. Check your insurer's online portal — most have them available digitally. If you can't find it, call the member services number on the back of your card.",
    note: "If you're uninsured, skip this step.",
    color: "blue",
  },
  {
    number: "5",
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
      "A program that nonprofit hospitals are required by law to offer. Depending on your income, it can reduce or completely eliminate your bill. Sometimes called \"charity care.\"",
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

export default function WhereDoIStart() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-3">Where Do I Start?</h1>
        <p className="text-gray-600 text-lg max-w-xl mx-auto">
          You got a medical bill you can't afford. You're not sure what to do. Here's the simple version.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-6 mb-16">
        {STEPS.map((step) => (
          <div
            key={step.number}
            className={`rounded-lg border p-6 ${
              step.color === "green"
                ? "bg-green-50 border-green-200"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                  step.color === "green" ? "bg-green-500" : "bg-blue-500"
                }`}
              >
                {step.number}
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-lg mb-2">{step.title}</h2>
                <p className="text-sm text-gray-700 leading-relaxed">{step.body}</p>
                {step.note && (
                  <p className="text-sm text-gray-500 italic mt-2">{step.note}</p>
                )}
                {step.link && (
                  <Link
                    to={step.link.to}
                    className="inline-block mt-3 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {step.link.label}
                  </Link>
                )}
              </div>
            </div>
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
