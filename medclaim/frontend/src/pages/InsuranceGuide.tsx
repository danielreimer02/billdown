import { useState } from "react"
import { Link } from "react-router-dom"

/**
 * InsuranceGuide — /insurance-guide
 *
 * "Understanding Your Insurance" — a friendly, jargon-free guide
 * that walks people through the basics of health insurance so they
 * can make confident decisions. Glossary terms link directly to
 * the full glossary (/plans/glossary#slug).
 */

// ── Glossary link helper ──

function G({ term, slug, children }: { term?: string; slug: string; children: React.ReactNode }) {
  return (
    <Link
      to={`/plans/glossary#${slug}`}
      className="text-blue-600 hover:underline font-medium"
      title={`Learn more: ${term ?? slug}`}
    >
      {children}
    </Link>
  )
}

// ── Sections ──

interface Section {
  id: string
  icon: string
  title: string
  content: React.ReactNode
}

function useSections(): Section[] {
  return [
    {
      id: "you-can-do-this",
      icon: "💪",
      title: "You can do this",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            Health insurance feels complicated on purpose. The jargon, the fine print, the endless plan options — it's designed
            to make you feel like you need an expert. <strong>You don't.</strong> Everything you need to understand your coverage
            and pick the right plan fits on this page.
          </p>
          <p>
            By the time you finish reading, you'll know exactly what your plan covers, what it costs you, and how to compare options
            with confidence. No MBA required.
          </p>
        </div>
      ),
    },
    {
      id: "how-insurance-works",
      icon: "🏗️",
      title: "How health insurance actually works",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            The core deal is simple: you pay a monthly fee (your{" "}
            <G slug="premium" term="Premium">premium</G>), and in return your insurance company
            agrees to split the cost of your medical care. How much they split depends on your plan.
          </p>
          <p>Here's the order costs flow:</p>
          <ol className="list-decimal list-inside space-y-2 ml-2">
            <li>
              <strong>You pay your <G slug="premium" term="Premium">premium</G> every month</strong> — this
              keeps your plan active, whether you use it or not.
            </li>
            <li>
              <strong>You pay the full cost until you hit your <G slug="deductible" term="Deductible">deductible</G></strong> — this
              is the amount you pay out-of-pocket each year before insurance kicks in. Preventive care
              (annual physicals, vaccines, screenings) is free even before the deductible.
            </li>
            <li>
              <strong>After the deductible, you split costs</strong> — you pay a{" "}
              <G slug="copay-copayment" term="Copay">copay</G> (fixed $ per visit) or{" "}
              <G slug="coinsurance" term="Coinsurance">coinsurance</G> (a % of the bill).
              Insurance pays the rest.
            </li>
            <li>
              <strong>Once you hit your <G slug="out-of-pocket-maximum-oop-max" term="OOP Max">out-of-pocket max</G>,
              insurance pays 100%</strong> — this is your safety net. No matter how bad things get,
              you'll never pay more than this amount in a year.
            </li>
          </ol>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-2">
            <p className="text-xs text-green-800">
              <strong>💡 The key insight:</strong> Lower premiums usually mean higher deductibles and vice versa.
              You're choosing between paying more now (premium) or paying more later (when you need care).
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "plan-types",
      icon: "📋",
      title: "Types of health plans",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            Every plan uses one of these networks. The difference is how much freedom you have to pick doctors
            and how much you pay for that flexibility:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {[
              {
                name: "HMO",
                slug: "hmo-health-maintenance-organization",
                emoji: "🏥",
                short: "Lowest cost, least flexible",
                desc: "Pick a primary care doctor (PCP). Need a referral to see specialists. Must stay in-network.",
                best: "Healthy people who want low premiums and don't mind referrals.",
              },
              {
                name: "PPO",
                slug: "ppo-preferred-provider-organization",
                emoji: "🌐",
                short: "Most flexible, highest cost",
                desc: "See any doctor, no referrals needed. Out-of-network covered but costs more.",
                best: "People who want freedom to choose specialists and don't mind paying more for it.",
              },
              {
                name: "EPO",
                slug: "epo-exclusive-provider-organization",
                emoji: "🎯",
                short: "Middle ground",
                desc: "No referrals needed, but zero out-of-network coverage (except emergencies).",
                best: "People who want PPO flexibility at HMO prices and have in-network providers nearby.",
              },
              {
                name: "HDHP",
                slug: "hdhp-high-deductible-health-plan",
                emoji: "🐖",
                short: "Low premium + HSA savings",
                desc: "Higher deductible, lower premiums. The only plan type that lets you open an HSA.",
                best: "Healthy people who want to save via the HSA's triple tax advantage.",
              },
            ].map((t) => (
              <div key={t.name} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span>{t.emoji}</span>
                  <G slug={t.slug} term={t.name}><strong>{t.name}</strong></G>
                  <span className="text-xs text-gray-400">— {t.short}</span>
                </div>
                <p className="text-xs text-gray-600 mb-1">{t.desc}</p>
                <p className="text-xs text-gray-500 italic">Best for: {t.best}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            <G slug="pos-point-of-service" term="POS">POS (Point of Service)</G> plans also exist — they're a hybrid of HMO and PPO but less common.
          </p>
        </div>
      ),
    },
    {
      id: "where-coverage-comes-from",
      icon: "🏢",
      title: "Where your insurance comes from",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            There are really only a few ways Americans get health insurance. Knowing which applies to you
            is the first step to understanding your options:
          </p>
          <div className="space-y-3">
            <div className="border-l-4 border-blue-400 pl-4">
              <h4 className="font-semibold text-gray-900">Employer-sponsored (most common)</h4>
              <p className="text-xs text-gray-600 mt-1">
                Your company picks a few plans and pays part of the premium. You choose from their options during
                open enrollment (usually October–November for January start). Your employer typically covers 50–80%
                of the premium cost — this is an enormous benefit that's easy to overlook.
              </p>
            </div>
            <div className="border-l-4 border-green-400 pl-4">
              <h4 className="font-semibold text-gray-900">ACA Marketplace (self-insured individuals)</h4>
              <p className="text-xs text-gray-600 mt-1">
                If you're self-employed, freelance, between jobs, or your employer doesn't offer insurance, you shop
                on <strong>healthcare.gov</strong> (or your state's marketplace). Plans are organized by{" "}
                <G slug="metal-tiers-bronze-silver-gold-platinum" term="Metal Tiers">metal tier</G> —
                Bronze (cheapest premiums, highest costs when you use care) through
                Platinum (highest premiums, lowest costs). Open enrollment runs November 1 – January 15 each year.
              </p>
              <p className="text-xs text-gray-600 mt-1">
                <strong>Subsidies:</strong> If your household income is below 400% of the Federal Poverty Level
                (~$58,000 for an individual in 2025), you likely qualify for premium subsidies that dramatically
                reduce your monthly cost. Many people qualify for plans under $50/month.
              </p>
            </div>
            <div className="border-l-4 border-purple-400 pl-4">
              <h4 className="font-semibold text-gray-900">Medicare (65+ or disabled)</h4>
              <p className="text-xs text-gray-600 mt-1">
                Federal program. Part A covers hospital stays (usually free if you worked 10+ years).
                Part B covers doctor visits and outpatient care (~$185/month in 2025).
                Part D covers prescriptions. Medicare Advantage (Part C) bundles everything into a private plan.
              </p>
            </div>
            <div className="border-l-4 border-amber-400 pl-4">
              <h4 className="font-semibold text-gray-900">Medicaid (low income)</h4>
              <p className="text-xs text-gray-600 mt-1">
                State + federal program for low-income individuals and families. Income limits vary by state
                (in expansion states, roughly under $20,000/year for individuals). Coverage is usually free or very low-cost.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "what-is-covered",
      icon: "✅",
      title: "What's actually covered (and what's not)",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            Under the ACA, all marketplace plans must cover 10 <strong>Essential Health Benefits</strong>.
            Most employer plans cover these too:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {[
              { emoji: "🩺", label: "Doctor visits & hospital stays" },
              { emoji: "🧪", label: "Lab tests & imaging" },
              { emoji: "💊", label: "Prescription drugs" },
              { emoji: "🤰", label: "Maternity & newborn care" },
              { emoji: "🧠", label: "Mental health & substance use" },
              { emoji: "🦴", label: "Rehabilitation services" },
              { emoji: "🧒", label: "Pediatric care (including dental & vision for kids)" },
              { emoji: "🚑", label: "Emergency & ambulance services" },
              { emoji: "💉", label: "Preventive care & vaccines (free!)" },
              { emoji: "🏠", label: "Home health services" },
            ].map((b) => (
              <div key={b.label} className="flex items-start gap-2 text-xs text-gray-700">
                <span className="shrink-0">{b.emoji}</span>
                <span>{b.label}</span>
              </div>
            ))}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
            <h4 className="text-xs font-semibold text-amber-800 mb-1">⚠️ What's usually NOT covered</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-amber-700">
              <span>🦷 <strong>Adult dental</strong> — requires a separate dental plan</span>
              <span>👁️ <strong>Adult vision</strong> — requires a separate vision plan</span>
              <span>💆 Cosmetic procedures</span>
              <span>🌍 Non-emergency care abroad</span>
              <span>🔬 Experimental treatments</span>
              <span>💊 Drugs not on the <G slug="formulary" term="Formulary">formulary</G></span>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-blue-800 mb-1">🦷 About dental & vision</h4>
            <p className="text-xs text-blue-700">
              Kids under 18 get dental and vision coverage built into their health plan (required by ACA).
              For adults, dental and vision are <strong>separate plans</strong> with their own premiums,
              usually $20–50/month each. Many employers offer these alongside your health plan.
              If you're on the ACA marketplace, you can add a standalone dental plan during enrollment.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "pre-existing-conditions",
      icon: "🛡️",
      title: "Pre-existing conditions: you're protected",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            If you have a chronic condition like diabetes, asthma, depression, heart disease, cancer history, or <em>any</em> prior
            medical condition — the most important thing to know is: <strong>insurance companies cannot deny you coverage
            or charge you more because of it.</strong> This has been federal law since the Affordable Care Act (ACA) in 2010.
          </p>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-green-800 mb-2">✅ What the ACA guarantees</h4>
            <ul className="text-xs text-green-700 space-y-1.5">
              <li>• <strong>Guaranteed issue</strong> — every insurer must sell you a plan during open enrollment, regardless of health status</li>
              <li>• <strong>No pre-existing condition exclusions</strong> — they can't refuse to cover treatment for conditions you already had</li>
              <li>• <strong>No higher premiums for being sick</strong> — they can only vary price by age, location, tobacco use, and plan tier</li>
              <li>• <strong>No annual or lifetime limits</strong> — they can't cap how much they'll pay for your care</li>
              <li>• <strong>Essential health benefits</strong> — all plans must cover your medications, doctor visits, hospital stays, mental health, and more</li>
            </ul>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-amber-800 mb-2">⚠️ Tips for choosing a plan with a pre-existing condition</h4>
            <ul className="text-xs text-amber-700 space-y-1.5">
              <li>• <strong>Check the <G slug="formulary" term="Formulary">formulary</G></strong> — make sure your medications are covered, and check what tier they're on. A drug on Tier 1 might cost $10/month on one plan and $80/month on another.</li>
              <li>• <strong>Check your doctors</strong> — verify your specialists and primary care doctor are in-network. Switching doctors mid-treatment is disruptive and expensive.</li>
              <li>• <strong>Compare total cost, not just premiums</strong> — with regular care needs, a Gold or Platinum plan (higher premiums, lower copays/deductible) usually saves money overall vs. a Bronze plan.</li>
              <li>• <strong>Look at the <G slug="out-of-pocket-maximum-oop-max" term="OOP Max">out-of-pocket max</G></strong> — this is your worst-case annual cost. With chronic conditions, you may hit it. A lower OOP max means a lower ceiling on your costs.</li>
              <li>• <strong>Ask about <G slug="prior-authorization-prior-auth-pa" term="Prior Auth">prior authorization</G></strong> — some plans require pre-approval for medications or procedures you've been getting for years. Check this before switching plans.</li>
            </ul>
          </div>

          <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
            <h4 className="text-xs font-semibold text-blue-800 mb-2">🧮 Use the Cost Simulator</h4>
            <p className="text-xs text-blue-700">
              On the <Link to="/insurance-plans" className="text-blue-600 hover:underline font-medium">Plan Comparison</Link> page,
              our <strong>Cost Simulator</strong> lets you select your specific care needs (monthly medications, specialist visits,
              therapy, etc.) and see what each plan would actually cost you in a year. It's the best way to compare plans
              when you have ongoing care needs.
            </p>
          </div>

          <div className="border-l-4 border-purple-400 pl-4 mt-2">
            <h4 className="font-semibold text-xs text-gray-900 mb-1">What about short-term health plans?</h4>
            <p className="text-xs text-gray-600">
              Short-term plans (also called "skimpy plans") are <strong>not</strong> required to follow ACA rules.
              They can deny coverage for pre-existing conditions, charge more based on health, and exclude essential benefits.
              If you have any chronic condition, avoid short-term plans — they're designed for healthy people between jobs, not for ongoing care.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "worst-case-scenarios",
      icon: "🚨",
      title: "Worst-case scenarios: cancer, catastrophic illness & bankruptcy",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            Nobody wants to think about the worst-case scenario, but understanding it is exactly
            what keeps it from destroying you financially. Here's the honest truth about catastrophic
            medical events — and why your plan's fine print matters more than you think.
          </p>

          {/* OOP Max as your safety net */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-green-800 mb-2">🛡️ Your #1 protection: the Out-of-Pocket Maximum</h4>
            <p className="text-xs text-green-700 mb-2">
              Every ACA-compliant plan has an{" "}
              <G slug="out-of-pocket-maximum-oop-max" term="OOP Max">out-of-pocket maximum</G> — the absolute most
              you can pay in a single year. For 2025, the federal cap is <strong>$9,200 for an individual</strong> and{" "}
              <strong>$18,400 for a family</strong>. Once you hit that number, your insurance pays 100% of everything else
              for the rest of the year.
            </p>
            <p className="text-xs text-green-700">
              This means even if you're diagnosed with cancer and your treatment costs $500,000 — your maximum
              out-of-pocket cost is capped. <strong>That's the whole point of insurance.</strong>
            </p>
          </div>

          {/* Real cost of catastrophic illness */}
          <div className="border rounded-lg p-4">
            <h4 className="text-xs font-semibold text-gray-900 mb-2">💸 The real cost of a major illness</h4>
            <div className="space-y-2 text-xs text-gray-600">
              <p>Here's what common catastrophic events actually cost — and what you'd owe with insurance:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {[
                  { event: "Cancer (annual treatment)", cost: "$150,000–$450,000+", you: "Up to OOP max (~$9,200)" },
                  { event: "Heart attack + surgery", cost: "$100,000–$200,000", you: "Up to OOP max (~$9,200)" },
                  { event: "Major organ transplant", cost: "$400,000–$1,200,000", you: "Up to OOP max (~$9,200)" },
                  { event: "Severe car accident (ICU)", cost: "$200,000–$500,000+", you: "Up to OOP max (~$9,200)" },
                ].map((e) => (
                  <div key={e.event} className="border rounded p-2">
                    <div className="font-medium text-gray-800">{e.event}</div>
                    <div className="text-gray-500 mt-0.5">Total cost: {e.cost}</div>
                    <div className="text-green-700 font-medium mt-0.5">Your cost: {e.you}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 italic mt-1">
                Sources: AHRQ, KFF, American Cancer Society. Figures are approximate and vary by region and treatment plan.
              </p>
            </div>
          </div>

          {/* Medical bankruptcy */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-red-800 mb-2">⚠️ Medical bankruptcy — the #1 cause of personal bankruptcy</h4>
            <p className="text-xs text-red-700 mb-2">
              Medical debt is the leading cause of bankruptcy in the United States. An estimated <strong>66.5% of all
              bankruptcies</strong> are tied to medical bills or illness-related lost income (American Journal of Public Health, 2019).
              Most of these people <em>had insurance</em> — they were underprepared for the costs their plan didn't cover.
            </p>
            <p className="text-xs text-red-700 mb-2">
              <strong>Why it happens even with insurance:</strong>
            </p>
            <ul className="text-xs text-red-700 space-y-1">
              <li>• <strong>High deductible + coinsurance</strong> — hitting a $9,200 OOP max is devastating if you don't have savings</li>
              <li>• <strong>Out-of-network surprises</strong> — the No Surprises Act helps, but gaps remain for non-emergency elective care</li>
              <li>• <strong>Lost income</strong> — serious illness often means months unable to work; insurance doesn't replace your paycheck</li>
              <li>• <strong>Non-covered services</strong> — experimental treatments, certain drugs, out-of-country care</li>
              <li>• <strong>Multi-year illness</strong> — OOP max resets every January; a 2-year cancer fight means 2× the max</li>
            </ul>
          </div>

          {/* Supplemental / umbrella policies */}
          <div className="border rounded-lg p-4">
            <h4 className="text-xs font-semibold text-gray-900 mb-2">☂️ Supplemental & umbrella policies</h4>
            <p className="text-xs text-gray-600 mb-2">
              Your primary health plan covers medical bills, but supplemental policies fill the gaps
              that cause financial ruin during serious illness:
            </p>
            <div className="space-y-2">
              {[
                {
                  name: "Critical illness insurance",
                  emoji: "🏥",
                  desc: "Pays a lump sum ($10,000–$100,000) if you're diagnosed with cancer, heart attack, stroke, or other specified conditions. You spend it however you want — bills, mortgage, groceries.",
                  cost: "~$25–$75/month depending on age and coverage amount",
                },
                {
                  name: "Hospital indemnity insurance",
                  emoji: "🛏️",
                  desc: "Pays a fixed daily amount ($100–$500/day) for each day you're hospitalized. Helps cover deductibles and living expenses during a hospital stay.",
                  cost: "~$20–$50/month",
                },
                {
                  name: "Short-term disability insurance",
                  emoji: "💼",
                  desc: "Replaces 50–70% of your income if you can't work due to illness or injury. Typically covers 3–6 months. Many employers offer this.",
                  cost: "~1–3% of your salary (often employer-paid)",
                },
                {
                  name: "Long-term disability insurance",
                  emoji: "📅",
                  desc: "Kicks in after short-term disability ends. Covers 50–60% of income for years or until retirement. This is the most underrated protection against financial ruin.",
                  cost: "~1–3% of your salary",
                },
                {
                  name: "Umbrella liability insurance",
                  emoji: "☂️",
                  desc: "Not health insurance per se, but extends your auto/home liability coverage to $1M+. Protects your assets if you're sued after a serious accident.",
                  cost: "~$15–$30/month for $1M in coverage",
                },
              ].map((p) => (
                <div key={p.name} className="flex gap-3 items-start">
                  <span className="text-lg shrink-0">{p.emoji}</span>
                  <div>
                    <h5 className="text-xs font-semibold text-gray-800">{p.name}</h5>
                    <p className="text-xs text-gray-600 mt-0.5">{p.desc}</p>
                    <p className="text-xs text-gray-400 italic mt-0.5">Typical cost: {p.cost}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action steps */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-blue-800 mb-2">✅ Your catastrophic-preparedness checklist</h4>
            <ul className="text-xs text-blue-700 space-y-1.5">
              <li>✅ <strong>Know your OOP max</strong> — can you afford that amount if something happens tomorrow?</li>
              <li>✅ <strong>Build an emergency fund</strong> — aim for at least your plan's deductible in liquid savings</li>
              <li>✅ <strong>Check your disability coverage</strong> — does your employer offer short/long-term disability? If not, buy it privately</li>
              <li>✅ <strong>Consider critical illness insurance</strong> — especially if you have a family history of cancer or heart disease</li>
              <li>✅ <strong>Stay in-network</strong> — for planned care, always verify network status to avoid surprise costs</li>
              <li>✅ <strong>Know about <Link to="/" className="text-blue-600 hover:underline font-medium">501(r) financial assistance</Link></strong> — if a catastrophic bill hits, most nonprofit hospitals must offer financial assistance (charity care) based on income</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: "costs-explained",
      icon: "💵",
      title: "Your costs — the real numbers",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            There are really only five numbers you need to understand. Here's what they mean
            in plain English:
          </p>
          <div className="space-y-3">
            {[
              {
                term: "Premium",
                slug: "premium",
                emoji: "📆",
                plain: "Your monthly subscription fee. You pay this whether you see a doctor or not.",
                range: "$0–$800+/month depending on plan, age, location, and subsidies.",
              },
              {
                term: "Deductible",
                slug: "deductible",
                emoji: "🎯",
                plain: "How much you pay before insurance starts helping. Resets every January 1.",
                range: "$0 (some Gold/Platinum plans) to $9,200 (maximum for 2025 individual).",
              },
              {
                term: "Copay",
                slug: "copay-copayment",
                emoji: "🏷️",
                plain: "A fixed dollar amount per visit. $30 for a doctor, $50 for a specialist, etc. You know the cost upfront.",
                range: "$0–$100+ depending on the service and your plan.",
              },
              {
                term: "Coinsurance",
                slug: "coinsurance",
                emoji: "📊",
                plain: "The percentage you pay after hitting your deductible. If it's 20%, you pay 20% and insurance pays 80%.",
                range: "0% (Platinum plans) to 40% (Bronze plans).",
              },
              {
                term: "Out-of-Pocket Max",
                slug: "out-of-pocket-maximum-oop-max",
                emoji: "🛡️",
                plain: "Your financial safety net. Once you've paid this much in a year, insurance pays 100% of everything else.",
                range: "Capped at $9,200/individual or $18,400/family for 2025.",
              },
            ].map((c) => (
              <div key={c.slug} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span>{c.emoji}</span>
                  <G slug={c.slug} term={c.term}><strong>{c.term}</strong></G>
                </div>
                <p className="text-xs text-gray-700">{c.plain}</p>
                <p className="text-xs text-gray-400 mt-1 italic">Typical range: {c.range}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "hsa-fsa",
      icon: "🐖",
      title: "HSA & FSA — tax-free money for healthcare",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            These are special accounts that let you pay for medical expenses with <strong>pre-tax dollars</strong>,
            effectively giving you a 20–40% discount on healthcare depending on your tax bracket.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span>⭐</span>
                <G slug="hsa-health-savings-account" term="HSA"><strong>HSA (Health Savings Account)</strong></G>
              </div>
              <ul className="text-xs text-gray-600 space-y-1 mt-2">
                <li>✅ Only available with <G slug="hdhp-high-deductible-health-plan" term="HDHP">HDHP</G> plans</li>
                <li>✅ Triple tax advantage (tax-free in, growth, and out)</li>
                <li>✅ Money rolls over forever — it's yours</li>
                <li>✅ Can invest it like a retirement account</li>
                <li>✅ 2025 limit: $4,300 individual / $8,550 family</li>
                <li>✅ After age 65, use for anything (like an IRA)</li>
              </ul>
              <p className="text-xs text-green-700 mt-2 font-medium">
                💡 If your employer matches HSA contributions, this is free money. Don't leave it on the table.
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span>📋</span>
                <G slug="fsa-flexible-spending-account" term="FSA"><strong>FSA (Flexible Spending Account)</strong></G>
              </div>
              <ul className="text-xs text-gray-600 space-y-1 mt-2">
                <li>✅ Available with any plan type</li>
                <li>✅ Tax-free contributions</li>
                <li>⚠️ Use-it-or-lose-it (mostly expires Dec 31)</li>
                <li>⚠️ Some employers allow $640 rollover</li>
                <li>✅ 2025 limit: $3,300</li>
                <li>⚠️ Tied to your employer — changes jobs, lose it</li>
              </ul>
              <p className="text-xs text-amber-700 mt-2 font-medium">
                💡 Good for predictable expenses (monthly prescriptions, glasses, therapy). Don't over-contribute.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "picking-a-plan",
      icon: "🎯",
      title: "How to actually pick a plan",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            Don't compare plans by premium alone. Here's a framework that works:
          </p>
          <ol className="list-decimal list-inside space-y-3 ml-1">
            <li>
              <strong>Estimate your healthcare usage</strong> — Are you healthy and rarely see doctors?
              Do you have a chronic condition? Planning a pregnancy or surgery? This determines whether
              you want low-premium/high-deductible or high-premium/low-deductible.
            </li>
            <li>
              <strong>Check your doctors are in-network</strong> — The cheapest plan is worthless if your
              doctors aren't covered. Look up each doctor on the plan's provider directory.
            </li>
            <li>
              <strong>Check your medications</strong> — Look at the plan's{" "}
              <G slug="formulary" term="Formulary">formulary</G> to see what tier your drugs are on.
              The difference can be $100+/month.
            </li>
            <li>
              <strong>Compare total annual cost, not just premium</strong> — Add up:{" "}
              (monthly premium × 12) + expected deductible spending + copays for your typical visits.
              Our <Link to="/insurance-plans" className="text-blue-600 hover:underline font-medium">Plan Comparison tool</Link> does
              this math for you.
            </li>
            <li>
              <strong>Look at the <G slug="out-of-pocket-maximum-oop-max" term="OOP Max">out-of-pocket max</G></strong> —
              this is your worst-case number. Can you afford it if something catastrophic happens?
            </li>
          </ol>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-2">
            <p className="text-xs text-green-800">
              <strong>🎯 Rule of thumb:</strong> If you're young and healthy with savings, an{" "}
              <G slug="hdhp-high-deductible-health-plan" term="HDHP">HDHP</G> +{" "}
              <G slug="hsa-health-savings-account" term="HSA">HSA</G> is usually the best financial move.
              If you have regular medical needs, a Silver or Gold plan with lower copays typically saves money overall.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "open-enrollment",
      icon: "📅",
      title: "Open enrollment & life events",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            You can only sign up for or change health insurance during specific windows:
          </p>
          <div className="space-y-2">
            <div className="flex gap-3 items-start">
              <span className="text-lg">📅</span>
              <div>
                <h4 className="font-semibold text-xs text-gray-900">ACA Open Enrollment</h4>
                <p className="text-xs text-gray-600">November 1 – January 15 each year for marketplace plans.</p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <span className="text-lg">🏢</span>
              <div>
                <h4 className="font-semibold text-xs text-gray-900">Employer Open Enrollment</h4>
                <p className="text-xs text-gray-600">Usually October–November, varies by company. Check with HR.</p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <span className="text-lg">🔄</span>
              <div>
                <h4 className="font-semibold text-xs text-gray-900">Special Enrollment Period (SEP)</h4>
                <p className="text-xs text-gray-600">
                  You can enroll or change plans mid-year if you have a "qualifying life event":
                  losing job/coverage, getting married/divorced, having a baby, moving to a new state.
                  You typically have 60 days from the event.
                </p>
              </div>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-1">
            <p className="text-xs text-amber-800">
              <strong>⚠️ Don't miss the window.</strong> Outside of open enrollment and qualifying events,
              you generally cannot change your plan until the next enrollment period.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "your-rights",
      icon: "⚖️",
      title: "Your rights (yes, you have them)",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            The healthcare system can feel stacked against you, but there are real protections on your side:
          </p>
          <ul className="space-y-2 ml-1">
            {[
              {
                title: "No Surprises Act",
                slug: "no-surprises-act",
                body: "You can't be surprise-billed by out-of-network providers at in-network facilities. Emergency care is always charged at in-network rates.",
              },
              {
                title: "Good Faith Estimates",
                slug: "good-faith-estimate-gfe",
                body: "You can request an upfront cost estimate before any scheduled service. If the final bill exceeds the estimate by $400+, you can dispute it.",
              },
              {
                title: "Free preventive care",
                slug: "",
                body: "Annual physicals, vaccines, cancer screenings, and other preventive services are free (no copay, no deductible) on all ACA-compliant plans.",
              },
              {
                title: "Appeal any denial",
                slug: "prior-authorization-prior-auth-pa",
                body: "If your insurance denies a claim, you have the right to appeal — first internally, then through an independent external review. Many denials are overturned on appeal.",
              },
              {
                title: "Itemized bill on request",
                slug: "",
                body: "You have the right to a detailed, line-by-line bill for any medical service. Always request one — billing errors are extremely common.",
              },
            ].map((r) => (
              <li key={r.title} className="text-xs">
                <strong>
                  {r.slug ? <G slug={r.slug} term={r.title}>{r.title}</G> : r.title}:
                </strong>{" "}
                {r.body}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      id: "next-steps",
      icon: "🚀",
      title: "Ready to take the next step?",
      content: (
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>You know the basics. Here's where to go from here:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                emoji: "📊",
                title: "Save & Compare My Plans",
                desc: "Add your plan options and compare them side-by-side with all the numbers.",
                to: "/insurance-plans",
              },
              {
                emoji: "🧮",
                title: "Cost Simulator",
                desc: "Estimate your total annual cost under different usage scenarios.",
                to: "/insurance-plans",
              },
              {
                emoji: "📖",
                title: "Insurance Glossary",
                desc: "Every term explained in plain English — bookmark it for later.",
                to: "/plans/glossary",
              },
              {
                emoji: "🛡️",
                title: "Fight a Medical Bill",
                desc: "Already have a bill? We'll help you review it and fight overcharges.",
                to: "/start",
              },
            ].map((cta) => (
              <Link
                key={cta.to}
                to={cta.to}
                className="border rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50/50 transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span>{cta.emoji}</span>
                  <span className="font-semibold text-sm text-gray-900 group-hover:text-blue-600">{cta.title}</span>
                </div>
                <p className="text-xs text-gray-500">{cta.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      ),
    },
  ]
}

// ── Page ──

export default function InsuranceGuide() {
  const sections = useSections()
  const [openId, setOpenId] = useState<string | null>(null)

  function toggle(id: string) {
    setOpenId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Understanding Your Insurance</h1>
        <p className="text-gray-600 text-sm leading-relaxed">
          Everything you need to know about health insurance — in plain English, no jargon.
          Whether you're picking a plan for the first time or trying to understand the one you have,
          this guide walks you through it step by step.
        </p>
        <div className="flex flex-wrap gap-3 mt-4">
          <Link to="/insurance-plans" className="text-xs text-blue-600 hover:underline font-medium">
            📊 Save & Compare My Plans →
          </Link>
          <Link to="/plans/glossary" className="text-xs text-blue-600 hover:underline font-medium">
            📖 Full Glossary →
          </Link>
          <Link to="/insurance-plans" className="text-xs text-blue-600 hover:underline font-medium">
            🧮 Plan Comparison Calculator →
          </Link>
        </div>
      </div>

      {/* Table of Contents */}
      <div className="border rounded-lg p-4 mb-8 bg-gray-50">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">On this page</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => { toggle(s.id); document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" }) }}
              className="text-left text-xs text-gray-600 hover:text-blue-600 py-0.5 flex items-center gap-1.5"
            >
              <span>{s.icon}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sections — accordion style */}
      <div className="space-y-3">
        {sections.map((s) => {
          const isOpen = openId === s.id
          return (
            <div key={s.id} id={s.id} className="border rounded-xl overflow-hidden scroll-mt-20">
              <button
                onClick={() => toggle(s.id)}
                className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors"
              >
                <span className="text-xl shrink-0">{s.icon}</span>
                <span className="font-semibold text-gray-900 flex-1">{s.title}</span>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className="px-5 pb-5 pt-1 border-t bg-white">
                  {s.content}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer CTA */}
      <div className="mt-10 text-center border-t pt-8">
        <p className="text-gray-500 text-sm mb-3">
          You've got the knowledge. Now put it to work.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            to="/insurance-plans"
            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Save & Compare My Plans
          </Link>
          <Link
            to="/plans/glossary"
            className="border border-gray-300 px-5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Browse Glossary
          </Link>
        </div>
      </div>
    </div>
  )
}
