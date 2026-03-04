import { useState } from "react"
import { Link } from "react-router-dom"

/**
 * InsuranceGlossary — /plans/glossary
 *
 * Plain-English explanations of every health insurance term,
 * why it matters, and how it affects your actual costs.
 */

interface Term {
  term: string
  aka?: string
  definition: string
  whyItMatters: string
  example?: string
  tip?: string
  category: string
}

const TERMS: Term[] = [
  // ── Cost Terms ──
  {
    term: "Premium",
    definition: "The amount you pay every month to have health insurance, whether or not you use any medical services. Think of it like a subscription fee.",
    whyItMatters: "A lower premium might seem like a good deal, but it usually means higher costs when you actually need care (higher deductible, copays, etc.). If you use healthcare frequently, a higher premium plan often saves money overall.",
    example: "You pay $450/month ($5,400/year) in premiums. Even if you never see a doctor, you still pay this.",
    tip: "Don't just compare premiums — compare total estimated annual cost. Our Cost Estimator does this for you.",
    category: "costs",
  },
  {
    term: "Deductible",
    definition: "The amount you pay out of your own pocket for covered services before your insurance starts paying. Resets every calendar year on January 1.",
    whyItMatters: "This is the biggest factor in your actual costs. A $6,000 deductible means you're essentially paying for everything yourself until you've spent $6,000 that year. Only then does insurance start helping.",
    example: "You have a $2,000 deductible. You get a $5,000 hospital bill. You pay the first $2,000 yourself, then insurance covers a percentage of the remaining $3,000.",
    tip: "If you rarely use healthcare, a high-deductible plan with lower premiums might save money. If you have a chronic condition or planned surgery, a low-deductible plan is usually better.",
    category: "costs",
  },
  {
    term: "Copay (Copayment)",
    aka: "Copayment, Co-pay",
    definition: "A fixed dollar amount you pay for a specific service — like $30 for a doctor visit or $15 for a generic prescription. You pay this at the time of service.",
    whyItMatters: "Copays are predictable. You know exactly what a doctor visit will cost. But not all services have copays — many are subject to the deductible and coinsurance instead.",
    example: "$30 copay for a PCP visit means you pay $30 regardless of what the doctor does during the visit (as long as it's a standard office visit).",
    tip: "Some plans have $0 copays for preventive care (annual physical, vaccines, screenings) — this is required by the ACA for most plans.",
    category: "costs",
  },
  {
    term: "Coinsurance",
    definition: "The percentage of a medical bill you pay after you've met your deductible. If your plan has 20% coinsurance, you pay 20% and insurance pays 80%.",
    whyItMatters: "This is where costs can get scary. 20% of a $100 doctor visit is $20. But 20% of a $50,000 surgery is $10,000. That's why the out-of-pocket maximum exists.",
    example: "After your $2,000 deductible, you have a $30,000 surgery. With 20% coinsurance, you pay $6,000 (20% of $30,000). Insurance pays $24,000.",
    tip: "Always check: does coinsurance apply before or after the deductible? Almost always it's after.",
    category: "costs",
  },
  {
    term: "Out-of-Pocket Maximum (OOP Max)",
    aka: "MOOP, Maximum Out-of-Pocket",
    definition: "The absolute most you'll pay in a year for covered in-network services. Once you hit this number, insurance pays 100% for the rest of the year. Includes deductible, copays, and coinsurance.",
    whyItMatters: "This is your worst-case scenario number. If something catastrophic happens — car accident, cancer diagnosis, major surgery — this is the most you'll spend. For 2025, the ACA caps this at $9,200 for individuals and $18,400 for families.",
    example: "Your OOP max is $8,000. You have a $50,000 hospital stay. After deductible + coinsurance, once your total out-of-pocket hits $8,000, insurance covers everything else at 100%.",
    tip: "When comparing plans, the OOP max is often more important than the deductible. It's your financial safety net.",
    category: "costs",
  },
  // ── Network Terms ──
  {
    term: "HMO (Health Maintenance Organization)",
    definition: "A plan that requires you to choose a Primary Care Physician (PCP) and get referrals to see specialists. You must stay in-network except for emergencies.",
    whyItMatters: "HMOs are usually the cheapest option, but the least flexible. If you see an out-of-network doctor (except in an emergency), you pay 100% out of pocket. No exceptions.",
    example: "You want to see a dermatologist. With an HMO, you first see your PCP, who writes a referral. Without the referral, the HMO won't cover the visit.",
    tip: "HMOs work well if you're healthy and don't need many specialists. They're the most affordable option for basic care.",
    category: "networks",
  },
  {
    term: "PPO (Preferred Provider Organization)",
    definition: "A plan that gives you a network of preferred doctors but also covers out-of-network care at a higher cost. No referral needed for specialists.",
    whyItMatters: "PPOs are the most flexible but most expensive. You can see any doctor without a referral. If you go out-of-network, the plan still covers part of the cost (but you pay more).",
    example: "In-network specialist visit: $50 copay. Same specialist but out-of-network: you pay 40% coinsurance after a separate out-of-network deductible.",
    tip: "If you travel frequently, see multiple specialists, or want maximum flexibility, a PPO is worth the higher premium.",
    category: "networks",
  },
  {
    term: "EPO (Exclusive Provider Organization)",
    definition: "Like a PPO but with no out-of-network coverage (except emergencies). You don't need referrals, but you must stay in-network.",
    whyItMatters: "EPOs are a middle ground — more flexible than HMOs (no referrals needed) but stricter than PPOs (no out-of-network coverage). Usually priced between HMO and PPO.",
    tip: "Check if your preferred doctors are in-network before choosing an EPO. There's zero coverage if you go out-of-network.",
    category: "networks",
  },
  {
    term: "POS (Point of Service)",
    definition: "A hybrid of HMO and PPO. You have a PCP and need referrals (like an HMO), but you can go out-of-network at a higher cost (like a PPO).",
    whyItMatters: "POS plans offer flexibility for people who want the structure of an HMO with an escape valve for out-of-network care. Less common than HMOs and PPOs.",
    category: "networks",
  },
  {
    term: "HDHP (High-Deductible Health Plan)",
    definition: "A plan with a higher deductible than traditional plans. For 2025, the IRS defines this as a deductible of at least $1,650 (individual) or $3,300 (family). HDHPs are the only plans eligible for a Health Savings Account (HSA).",
    whyItMatters: "Lower monthly premiums, but you pay more when you actually use care. The trade-off is HSA eligibility — the HSA's triple tax advantage can make HDHPs the best financial choice for healthy people.",
    example: "HDHP premium: $200/month with $3,000 deductible. Traditional plan: $400/month with $500 deductible. If you're healthy, the HDHP saves $200/month ($2,400/year).",
    tip: "If your employer offers HSA matching, an HDHP + HSA is almost always the best deal — free money in a triple-tax-advantaged account.",
    category: "networks",
  },
  // ── Savings Account Terms ──
  {
    term: "HSA (Health Savings Account)",
    aka: "Health Savings Account",
    definition: "A tax-advantaged savings account for medical expenses. Contributions are tax-deductible, growth is tax-free, and withdrawals for medical expenses are tax-free. Triple tax advantage — the only account in the US tax code with this benefit.",
    whyItMatters: "An HSA is the most powerful savings vehicle available. Unlike FSAs, the money rolls over every year and you keep it forever (even if you change jobs). After age 65, you can use it for anything (just pay income tax, like a traditional IRA).",
    example: "You contribute $4,150/year (2025 individual max). In the 24% tax bracket, that saves $996 in taxes. Invest the HSA in index funds and it grows tax-free.",
    tip: "If you can afford to, pay medical bills out of pocket and let your HSA grow invested. Save receipts — you can reimburse yourself from the HSA decades later, tax-free.",
    category: "savings",
  },
  {
    term: "FSA (Flexible Spending Account)",
    aka: "Flexible Spending Account",
    definition: "An employer-sponsored account where you set aside pre-tax dollars for medical expenses. Unlike HSAs, most FSA funds expire at the end of the year (use-it-or-lose-it).",
    whyItMatters: "FSAs reduce your taxable income, but you must estimate your expenses ahead of time. Some employers offer a $640 rollover or 2.5-month grace period, but most of the money expires December 31.",
    tip: "If you have predictable medical expenses (regular prescriptions, glasses, therapy), an FSA saves money. Don't over-contribute — you lose unspent funds.",
    category: "savings",
  },
  // ── Coverage Terms ──
  {
    term: "Metal Tiers (Bronze, Silver, Gold, Platinum)",
    definition: "ACA marketplace plans are categorized by how costs are split between you and the insurance company. Bronze: insurance pays ~60%, you pay ~40%. Silver: 70/30. Gold: 80/20. Platinum: 90/10. This doesn't reflect quality of care — only cost-sharing.",
    whyItMatters: "Bronze has the lowest premiums but highest out-of-pocket costs. Platinum has the highest premiums but lowest out-of-pocket. Silver plans are special because they're the only tier eligible for Cost-Sharing Reductions (CSR) if you qualify by income.",
    tip: "If you qualify for CSR subsidies (income 100–250% FPL), Silver plans become the best value — you get Gold/Platinum-level benefits at Silver-level premiums.",
    category: "coverage",
  },
  {
    term: "Formulary",
    definition: "The list of prescription drugs your plan covers, organized into tiers. Tier 1 (generics) has the lowest copay. Higher tiers (preferred brand, non-preferred, specialty) cost more.",
    whyItMatters: "If you take regular medications, check the formulary BEFORE choosing a plan. Your drug might be Tier 1 on one plan ($10 copay) and Tier 3 on another ($60 copay). Some drugs aren't covered at all.",
    tip: "Every plan's formulary is publicly available online. Search for your specific medications before enrolling.",
    category: "coverage",
  },
  {
    term: "Prior Authorization (Prior Auth, PA)",
    definition: "A requirement that your doctor gets approval from the insurance company BEFORE performing certain procedures, prescribing certain drugs, or ordering certain tests. If you skip this step, insurance may deny the claim entirely.",
    whyItMatters: "Prior auth denials are one of the most common reasons for claim denials. If your doctor doesn't get prior auth and the insurer denies coverage, you could be stuck with the full bill.",
    example: "Your doctor recommends an MRI. The insurance company requires prior auth. If your doctor gets approval first, it's covered. If they don't, you may owe the full $2,500.",
    tip: "Always ask your doctor's office: 'Does this need prior authorization?' If so, confirm it's been approved BEFORE the procedure.",
    category: "coverage",
  },
  {
    term: "Explanation of Benefits (EOB)",
    aka: "EOB",
    definition: "A document from your insurance company showing what was billed, what was covered, what they paid, and what you owe. It is NOT a bill — it's a summary of how your claim was processed.",
    whyItMatters: "The EOB is your receipt. Compare it to the bill you receive from the hospital. If the numbers don't match, something is wrong. Many billing errors are caught by comparing the EOB to the itemized bill.",
    tip: "Always wait for the EOB before paying a hospital bill. The amount you actually owe is on the EOB, not necessarily what the hospital bills you.",
    category: "coverage",
  },
  {
    term: "Allowed Amount",
    aka: "Negotiated Rate, Contracted Rate",
    definition: "The maximum amount your insurance company has agreed to pay a provider for a specific service. This is the real price — not the inflated chargemaster price the hospital lists.",
    whyItMatters: "Hospitals have a \"chargemaster\" price (often 3–5× higher than what anyone actually pays). Your insurance has negotiated a lower rate. If you're in-network, you only pay your share of the allowed amount, not the chargemaster price.",
    example: "Hospital bills $5,000 for a procedure. Insurance allowed amount is $1,800. You pay your copay/coinsurance based on $1,800, not $5,000.",
    tip: "If you're uninsured, you can negotiate using the Medicare rate as a benchmark. Hospitals charge private insurers about 2.5× Medicare on average (RAND Corporation, 2024).",
    category: "coverage",
  },
  {
    term: "No Surprises Act",
    aka: "NSA, Surprise Billing Protection",
    definition: "A federal law (effective January 2022) that protects you from surprise medical bills when you receive emergency care or are treated by an out-of-network provider at an in-network facility without your consent.",
    whyItMatters: "Before this law, you could go to an in-network hospital but get a huge bill from an out-of-network anesthesiologist or surgeon you didn't choose. Now, in those situations, you can only be charged in-network rates.",
    tip: "If you get a surprise out-of-network bill, cite the No Surprises Act (Public Law 117-169). The provider must re-bill at the in-network rate.",
    category: "coverage",
  },
  {
    term: "Good Faith Estimate (GFE)",
    definition: "Under the No Surprises Act, healthcare providers must give uninsured or self-pay patients a written estimate of expected charges BEFORE providing non-emergency services. If the final bill exceeds the GFE by $400 or more, you can dispute it.",
    whyItMatters: "This is one of the strongest new tools for uninsured patients. If the hospital charges $400+ more than their estimate, you have a legal right to dispute through a federal process.",
    tip: "Always request a Good Faith Estimate in writing before any scheduled procedure. Keep it — it's your legal protection.",
    category: "coverage",
  },
]

const CATEGORIES = [
  { key: "costs", label: "💲 Costs & Payments", description: "What you pay and when" },
  { key: "networks", label: "🏥 Plan Types & Networks", description: "How plans organize care" },
  { key: "savings", label: "💰 Tax-Advantaged Accounts", description: "HSA, FSA, and saving on taxes" },
  { key: "coverage", label: "🛡️ Coverage & Protections", description: "What's covered and your rights" },
]

export default function InsuranceGlossary() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const filtered = TERMS.filter(t => {
    if (activeCategory && t.category !== activeCategory) return false
    if (search) {
      const s = search.toLowerCase()
      return t.term.toLowerCase().includes(s) || t.definition.toLowerCase().includes(s)
    }
    return true
  })

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Insurance Terms Glossary</h1>
        <Link to="/plans" className="text-sm text-blue-600 hover:underline">← Back to Plan Comparison</Link>
      </div>
      <p className="text-gray-600 text-sm mb-6">
        Plain-English explanations of health insurance jargon — what each term means,
        why it matters for your wallet, and tips for making smarter plan decisions.
      </p>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search terms…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            !activeCategory ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All ({TERMS.length})
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setActiveCategory(c.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeCategory === c.key ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {c.label} ({TERMS.filter(t => t.category === c.key).length})
          </button>
        ))}
      </div>

      {/* Terms */}
      <div className="space-y-4">
        {filtered.map(t => (
          <div key={t.term} className="border rounded-xl p-5 hover:border-blue-300 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <h2 className="text-lg font-semibold text-gray-900">{t.term}</h2>
              <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded shrink-0 ml-2">
                {CATEGORIES.find(c => c.key === t.category)?.label}
              </span>
            </div>
            {t.aka && <p className="text-xs text-gray-400 mb-2">Also known as: {t.aka}</p>}

            <p className="text-sm text-gray-700 mb-3 leading-relaxed">{t.definition}</p>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
              <h3 className="text-xs font-semibold text-amber-800 mb-1">⚠️ Why This Matters</h3>
              <p className="text-xs text-amber-700 leading-relaxed">{t.whyItMatters}</p>
            </div>

            {t.example && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                <h3 className="text-xs font-semibold text-blue-800 mb-1">📋 Example</h3>
                <p className="text-xs text-blue-700 leading-relaxed">{t.example}</p>
              </div>
            )}

            {t.tip && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <h3 className="text-xs font-semibold text-green-800 mb-1">💡 Tip</h3>
                <p className="text-xs text-green-700 leading-relaxed">{t.tip}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No terms match your search.
        </div>
      )}
    </div>
  )
}
