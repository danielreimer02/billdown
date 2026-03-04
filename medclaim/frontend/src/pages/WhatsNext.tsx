import { Link } from "react-router-dom"

const RESOURCES = [
  {
    icon: "🛑",
    title: "Don't Pay Right Away — and Don't Sign Anything",
    description:
      "The most important thing you can do when you get a hospital bill is slow down. You almost always have more time than you think, and paying too quickly — or signing up for financing — can cost you thousands. They're likely trying to put pressure on you to pay right away so you overpay before you know your rights.",
    details: [
      "Request an itemized bill before you pay anything — just asking for one often causes charges to drop, because hospitals know you're looking at the details",
      "Never sign up for CareCredit or other medical credit cards at the point of service — these are high-interest loans (26.99% APR after the promo period) that transfer your debt from the hospital to a bank and waive your right to dispute",
      "Don't set up a payment plan until you've checked if you qualify for financial assistance — paying even a small amount can disqualify you from some programs",
      "Most hospitals won't send a bill to collections for 90–180 days, and many states require them to screen you for financial assistance before they can",
    ],
  },
  {
    icon: "🏥",
    title: "Federally Qualified Health Centers (FQHCs)",
    description:
      "FQHCs are community health centers that provide primary care on a sliding fee scale based on your income. They exist in every state and they cannot turn you away, regardless of insurance status or ability to pay. If you're uninsured or underinsured, this is how you get ongoing care without going through a hospital ER.",
    details: [
      "Services include primary care, dental, behavioral health, and prescriptions",
      "Fees are based on your income — many patients pay $0–$30 per visit",
      "Over 1,400 organizations operating 15,000+ sites nationwide",
    ],
    cta: {
      label: "Find an FQHC near you →",
      href: "https://findahealthcenter.hrsa.gov/",
    },
  },
  {
    icon: "🧾",
    title: "Get Your Itemized Bill",
    description:
      "If you haven't already, call the hospital billing department and ask for a complete itemized bill — not the summary they mailed you. Here's something most people don't know: just requesting an itemized bill often causes charges to drop. Hospitals know that once you're looking at the line items, they can't get away with padding. It's common for bills to shrink before you even dispute anything.",
    details: [
      "The summary bill you got in the mail only shows a total or a few categories — the itemized bill shows every individual charge with CPT codes, units, and prices",
      "Just asking for one signals that you're paying attention, and charges frequently drop before you even file a dispute",
      "Look for duplicate charges, unbundled procedures, incorrect quantities, and charges for services you didn't receive",
      'Call billing and say: "I\'d like a complete itemized bill showing all CPT codes, ICD-10 codes, units, and charges"',
    ],
    cta: {
      label: "Learn more in our Getting Started guide →",
      href: "/start",
    },
  },
  {
    icon: "🛡️",
    title: "Medicaid & CHIP",
    description:
      "Medicaid provides free or low-cost health coverage to millions of Americans, including adults with limited income, children, pregnant women, elderly adults, and people with disabilities. CHIP covers children in families that earn too much for Medicaid but can't afford private insurance. Many people qualify and don't realize it.",
    details: [
      "Income limits vary by state — some states cover adults up to 138% FPL",
      "Application is free and can be done online, by phone, or in person",
      "Coverage can be retroactive up to 3 months before you applied",
      "If you were uninsured during your hospital visit, you may be able to get Medicaid to cover it retroactively",
    ],
    cta: {
      label: "Check your eligibility at Healthcare.gov →",
      href: "https://www.healthcare.gov/medicaid-chip/getting-medicaid-chip/",
    },
  },
  {
    icon: "💳",
    title: "Medical Debt & Your Credit",
    description:
      "The rules around medical debt and credit reporting have changed significantly in recent years. Knowing your rights can protect your credit score even if you have unpaid medical bills.",
    details: [
      "Paid medical debt is removed from credit reports (as of 2023)",
      "Medical debt under $500 is no longer reported to credit bureaus",
      "New medical debt can't appear on your credit report for at least one year",
      "Medical debt can no longer be used to deny you a VA or FHA mortgage",
      "Many states have additional protections — wage garnishment limits, hospital lien restrictions, and statute of limitations on medical debt",
    ],
  },
  {
    icon: "💊",
    title: "Prescription Assistance",
    description:
      "If you're struggling with medication costs, there are programs that can help — even if you have insurance.",
    details: [
      "Most drug manufacturers offer Patient Assistance Programs (PAPs) for people who can't afford their medications",
      "Medicare Part D's Extra Help program covers premiums, deductibles, and copays for prescriptions",
      "GoodRx, RxAssist, and NeedyMeds are free tools that find discounts and coupons",
      "FQHCs often have their own pharmacies with deeply discounted prices through the 340B Drug Pricing Program",
    ],
    cta: {
      label: "Search for assistance at NeedyMeds →",
      href: "https://www.needymeds.org/",
    },
  },
  {
    icon: "⚖️",
    title: "Know Your Rights",
    description:
      "You have more rights than most billing departments will tell you. Here are the big ones.",
    details: [
      "You have the right to an itemized bill — hospitals must provide one upon request",
      "You have the right to your medical records under HIPAA — they must respond within 30 days",
      "Nonprofit hospitals must offer financial assistance under IRS Section 501(r) — and they must publicize it",
      "The No Surprises Act protects you from surprise out-of-network bills for emergency services and certain non-emergency situations",
      "You can dispute any charge, and many hospitals have internal appeal processes",
      "In most states, hospitals cannot send a bill to collections without first screening you for financial assistance eligibility",
    ],
  },
  {
    icon: "🤝",
    title: "Negotiating What's Left",
    description:
      "Even after financial assistance, insurance, and dispute resolution — if you still owe a balance, you almost always have room to negotiate.",
    details: [
      "Hospitals routinely accept 20–40% of the original balance as payment in full",
      "Ask for a \"prompt pay discount\" — many hospitals offer 10–30% off if you pay the remaining balance upfront",
      "Request a zero-interest payment plan — hospitals are required to offer \"reasonable\" plans before pursuing collections",
      "If the bill is already with a collector, you can still negotiate — collection agencies typically buy debt for pennies on the dollar",
      "Get any agreement in writing before you pay",
    ],
  },
]

export default function WhatsNext() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-3">Protect Yourself for Next Time</h1>
        <p className="text-gray-600 text-lg max-w-xl mx-auto">
          You've dealt with the bill. Here's how to protect yourself before your next hospital or healthcare visit — and resources most people don't know about.
        </p>
      </div>

      {/* Resource cards */}
      <div className="space-y-8 mb-16">
        {RESOURCES.map((resource) => (
          <div key={resource.title} className="border border-gray-200 rounded-lg p-6">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-2xl leading-none">{resource.icon}</span>
              <h2 className="font-bold text-lg">{resource.title}</h2>
            </div>

            <p className="text-sm text-gray-700 mb-4 leading-relaxed">
              {resource.description}
            </p>

            <ul className="space-y-2 mb-4">
              {resource.details.map((detail, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="text-blue-500 mt-0.5 flex-shrink-0">→</span>
                  {detail}
                </li>
              ))}
            </ul>

            {resource.cta && (
              resource.cta.href.startsWith("/") ? (
                <Link
                  to={resource.cta.href}
                  className="inline-block text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {resource.cta.label}
                </Link>
              ) : (
                <a
                  href={resource.cta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {resource.cta.label}
                </a>
              )
            )}
          </div>
        ))}
      </div>

      {/* Bottom */}
      <div className="text-center bg-gray-50 border border-gray-200 rounded-lg p-8">
        <h2 className="text-xl font-bold mb-2">You're not alone in this</h2>
        <p className="text-gray-600 mb-4 text-sm max-w-lg mx-auto">
          Over 100 million Americans carry medical debt. The system is confusing by design — but the tools to fight back exist. You just have to know where to look.
        </p>
        <Link
          to="/"
          className="inline-block text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          ← Back to Home
        </Link>
      </div>
    </div>
  )
}
