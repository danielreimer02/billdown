import { Link } from "react-router-dom"

/**
 * WhatWeOffer — /what-we-offer
 *
 * Three vertical sections on desktop (side-by-side cards),
 * stacked on mobile — one for Individuals, Physicians, Companies.
 */

const sections = [
  {
    id: "individuals",
    icon: "🧑",
    title: "For Individuals",
    subtitle: "Fight unfair medical bills and get the price you actually owe.",
    color: "border-blue-200 bg-blue-50/30",
    accentColor: "text-blue-700",
    tagColor: "bg-blue-100 text-blue-700",
    cta: { label: "Learn More →", to: "/individuals" },
    features: [
      {
        icon: "🧾",
        title: "Bill Review & Error Detection",
        desc: "Upload your itemized bill and we scan every line against 4.5 million CMS bundling rules, MUE unit limits, and Medicare pricing to find overcharges.",
      },
      {
        icon: "📝",
        title: "Auto-Generated Dispute Letters",
        desc: "We draft professional dispute letters citing specific federal regulations, NCCI edits, and Medicare fee schedule data — ready to print and send.",
      },
      {
        icon: "💰",
        title: "Charity Care Screening",
        desc: "Check if you qualify to have your entire bill eliminated through the hospital's Financial Assistance Program. Most nonprofit hospitals must offer this.",
      },
      {
        icon: "🛡️",
        title: "Know Your Rights",
        desc: "Good Faith Estimates, the No Surprises Act, HIPAA record requests, 501(r) charity care — we tell you exactly what laws protect you.",
      },
      {
        icon: "📊",
        title: "Plan Comparison & Cost Estimator",
        desc: "Compare health plans side-by-side and estimate which one actually costs less based on your expected healthcare usage.",
      },
      {
        icon: "📬",
        title: "Denial Appeals",
        desc: "Got a denial? We identify the reason code, verify LCD coverage for your procedure, and generate an appeal letter with supporting evidence.",
      },
    ],
  },
  {
    id: "physicians",
    icon: "🩺",
    title: "For Physicians",
    subtitle: "Prevent denials before they happen. Code with confidence.",
    color: "border-green-200 bg-green-50/30",
    accentColor: "text-green-700",
    tagColor: "bg-green-100 text-green-700",
    cta: { label: "Learn More →", to: "/physicians" },
    features: [
      {
        icon: "📋",
        title: "Pre-Submission LCD Check",
        desc: "Enter CPT + ICD-10 + state and instantly see if the diagnosis supports the procedure under Local Coverage Determinations. Catch denials before they happen.",
      },
      {
        icon: "✅",
        title: "Standalone vs. Combination Rules",
        desc: "See exactly which ICD-10 codes work alone and which require combinations from multiple groups — no more guessing at group rules.",
      },
      {
        icon: "⚠️",
        title: "Prior Treatment Requirements",
        desc: "341 LCDs require documentation of conservative treatment before surgery. We flag when your LCD requires this so you can prepare documentation.",
      },
      {
        icon: "🔍",
        title: "NCCI Bundling & MUE Lookup",
        desc: "Check any CPT pair for bundling edits and look up maximum units per code per day. Avoid claim rejections from automated edit checks.",
      },
      {
        icon: "💲",
        title: "Medicare Fee Schedule",
        desc: "Look up RVU breakdowns and Medicare payment rates for any CPT code, with GPCI adjustments by locality. Know what Medicare pays before you bill.",
      },
      {
        icon: "📑",
        title: "Documentation Guidance",
        desc: "View LCD indication language, bibliography, and evidence summaries so you know exactly what documentation the MAC expects.",
      },
    ],
  },
  {
    id: "companies",
    icon: "🏢",
    title: "For Companies",
    subtitle: "Reduce healthcare spend and protect your employees.",
    color: "border-purple-200 bg-purple-50/30",
    accentColor: "text-purple-700",
    tagColor: "bg-purple-100 text-purple-700",
    cta: { label: "Learn More →", to: "/companies" },
    features: [
      {
        icon: "📊",
        title: "Claims Audit at Scale",
        desc: "Upload EOBs or claims data in bulk. We analyze every line item against CMS rules to find systematic billing errors across your employee population.",
      },
      {
        icon: "💵",
        title: "Cost Benchmarking",
        desc: "Compare what your plan is paying to Medicare rates. RAND research shows employers pay 2.5× Medicare on average — we show you where you're overpaying.",
      },
      {
        icon: "📈",
        title: "Analytics Dashboard",
        desc: "Track total savings found, common billing errors, top overcharging providers, and claim denial rates across your organization.",
      },
      {
        icon: "🔔",
        title: "Price Transparency Monitoring",
        desc: "Monitor hospital machine-readable files and rate transparency data. Get alerts when contracted rates exceed benchmarks.",
      },
      {
        icon: "📋",
        title: "Plan Design Insights",
        desc: "Use our cost estimator to model how different plan designs (deductible, coinsurance, OOP max) affect total employee spend.",
      },
      {
        icon: "🤝",
        title: "Employee Advocacy",
        desc: "Give employees access to bill review and dispute tools as a benefit. Reduce out-of-pocket costs and improve satisfaction.",
      },
    ],
  },
]

export default function WhatWeOffer() {
  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-2">What We Offer</h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          MedClaim uses the same CMS databases Medicare uses — NCCI edits, MUE limits, fee
          schedules, and Local Coverage Determinations — to help individuals, physicians,
          and companies navigate the healthcare billing system.
        </p>
      </div>

      {/* Three vertical sections — side by side on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {sections.map(section => (
          <div
            key={section.id}
            className={`border rounded-2xl p-6 flex flex-col ${section.color}`}
          >
            {/* Header */}
            <div className="mb-5">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{section.icon}</span>
                <div>
                  <h2 className={`text-lg font-bold ${section.accentColor}`}>{section.title}</h2>
                  <p className="text-xs text-gray-600">{section.subtitle}</p>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="space-y-4 flex-1">
              {section.features.map(f => (
                <div key={f.title} className="flex gap-3">
                  <span className="text-lg shrink-0 mt-0.5">{f.icon}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{f.title}</h3>
                    <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-6 pt-4 border-t border-gray-200/50">
              <Link
                to={section.cta.to}
                className={`text-sm font-semibold ${section.accentColor} hover:underline`}
              >
                {section.cta.label}
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div className="text-center mt-12">
        <p className="text-sm text-gray-500 mb-4">Ready to get started?</p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            to="/cases/new"
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Start a Case →
          </Link>
          <Link
            to="/start"
            className="text-blue-600 text-sm font-medium hover:underline"
          >
            How it works
          </Link>
          <Link
            to="/plans/glossary"
            className="text-blue-600 text-sm font-medium hover:underline"
          >
            Insurance Glossary
          </Link>
        </div>
      </div>
    </div>
  )
}
