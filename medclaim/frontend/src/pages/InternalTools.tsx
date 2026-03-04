/**
 * InternalTools — /tools
 *
 * Landing page for internal/advanced tools:
 *   - Bill Analysis (NCCI/MUE/PFS manual checkers)
 *   - LCD Lookup (coverage determination search)
 */

import { Link } from "react-router-dom"

const tools = [
  {
    to: "/bill-analysis",
    icon: "🔍",
    name: "Bill Analysis",
    description:
      "Check CPT pairs for NCCI bundling edits, look up MUE unit limits, and get Medicare fee schedule rates. Useful for manual spot-checks.",
  },
  {
    to: "/lcd",
    icon: "📋",
    name: "LCD Lookup",
    description:
      "Search Local Coverage Determinations to see if an ICD-10 diagnosis supports a CPT procedure, view covered code lists, and find CPTs for a diagnosis.",
  },
  {
    to: "/lcd-explorer",
    icon: "🗂️",
    name: "LCD Explorer",
    description:
      "Browse and search all Local Coverage Determinations and Articles in the CMS database. View CPT codes, ICD-10 mappings, group rules, and state jurisdictions.",
  },
]

export default function InternalTools() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-2">Internal Tools</h1>
      <p className="text-gray-600 mb-8">
        Advanced lookup tools for billing codes, coverage determinations, and Medicare pricing.
        These are the same databases our automated analysis uses under the hood.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tools.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="border rounded-xl p-6 hover:border-blue-400 hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">{tool.icon}</span>
              <h2 className="text-lg font-semibold group-hover:text-blue-600 transition-colors">
                {tool.name}
              </h2>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{tool.description}</p>
            <p className="text-xs text-blue-600 mt-3 font-medium group-hover:underline">
              Open →
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
