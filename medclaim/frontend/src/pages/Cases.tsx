import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { casesApi } from "@/lib/api"
import type { Case } from "@/types"

const statusColors: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800",
  analyzing: "bg-blue-100 text-blue-800",
  reviewed:  "bg-purple-100 text-purple-800",
  disputed:  "bg-orange-100 text-orange-800",
  resolved:  "bg-green-100 text-green-800",
  closed:    "bg-gray-100 text-gray-800",
}

export default function Cases() {
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    casesApi.list()
      .then(setCases)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">My Cases</h1>
      </div>

      {loading && (
        <div className="text-center text-gray-500 py-12">Loading cases...</div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && cases.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">📋</div>
          <h2 className="text-xl font-semibold mb-2">No cases yet</h2>
          <p className="text-gray-600 mb-6">
            Upload a medical bill to get started. We'll analyze it for errors
            and overcharges.
          </p>
        </div>
      )}

      {cases.length > 0 && (
        <div className="space-y-4">
          {cases.map(c => (
            <Link
              key={c.id}
              to={`/cases/${c.id}`}
              className="block border rounded-lg p-5 hover:bg-gray-50 transition"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-semibold">
                      {c.providerName || "Unnamed Provider"}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[c.status] || statusColors.pending}`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {c.state && `${c.state} · `}
                    Created {new Date(c.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right">
                  {c.totalBilled != null && (
                    <div className="font-semibold">
                      ${c.totalBilled.toLocaleString()}
                    </div>
                  )}
                  {c.savingsFound > 0 && (
                    <div className="text-green-600 text-sm">
                      ${c.savingsFound.toLocaleString()} in potential savings
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}