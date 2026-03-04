import { useState, useEffect } from "react"
import { configApi, type ConfigEntry } from "@/lib/api"

/**
 * SiteMaintenance — /site-maintenance
 *
 * Admin page for editing letter templates, reference data, and site settings
 * stored in the site_config table. Everything here is admin-only / internal.
 */

const CATEGORY_META: Record<string, { label: string; icon: string; description: string }> = {
  letter_templates: {
    label: "Letter Templates",
    icon: "✉️",
    description: "Editable letter templates with {{variable}} placeholders. Used to generate dispute letters, records requests, and insurance correspondence.",
  },
  reference_data: {
    label: "Reference Data",
    icon: "📚",
    description: "Lookup tables and reference data used throughout the platform — denial codes, state aliases, etc.",
  },
  site_settings: {
    label: "Site Settings",
    icon: "⚙️",
    description: "Global settings like the CMS conversion factor, study citations, and other values that change periodically.",
  },
}

export default function SiteMaintenance() {
  const [entries, setEntries] = useState<ConfigEntry[]>([])
  const [categories, setCategories] = useState<Array<{ category: string; count: number }>>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ConfigEntry | null>(null)
  const [editJson, setEditJson] = useState("")
  const [editLabel, setEditLabel] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [saving, setSaving] = useState(false)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  // Creating new entry
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState("")
  const [newCategory, setNewCategory] = useState("site_settings")

  async function load() {
    setLoading(true)
    try {
      const [cats, items] = await Promise.all([
        configApi.categories(),
        activeCategory ? configApi.list(activeCategory) : configApi.list(),
      ])
      setCategories(cats)
      setEntries(items)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [activeCategory])

  function startEdit(entry: ConfigEntry) {
    setEditing(entry)
    setEditJson(JSON.stringify(entry.value, null, 2))
    setEditLabel(entry.label ?? "")
    setEditDesc(entry.description ?? "")
    setJsonError(null)
  }

  function validateJson(text: string): boolean {
    try {
      JSON.parse(text)
      setJsonError(null)
      return true
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON")
      return false
    }
  }

  async function saveEdit() {
    if (!editing) return
    if (!validateJson(editJson)) return
    setSaving(true)
    try {
      await configApi.update(editing.key, {
        value: JSON.parse(editJson),
        label: editLabel || undefined,
        description: editDesc || undefined,
      })
      setFlash(`✅ Saved "${editing.key}"`)
      setTimeout(() => setFlash(null), 3000)
      setEditing(null)
      load()
    } catch (e) {
      setFlash(`❌ Failed to save: ${e instanceof Error ? e.message : "unknown error"}`)
    }
    setSaving(false)
  }

  async function createEntry() {
    if (!newKey.trim()) return
    if (!validateJson(editJson)) return
    setSaving(true)
    try {
      await configApi.create({
        key: newKey.trim(),
        value: JSON.parse(editJson),
        category: newCategory,
        label: editLabel || undefined,
        description: editDesc || undefined,
      })
      setFlash(`✅ Created "${newKey}"`)
      setTimeout(() => setFlash(null), 3000)
      setCreating(false)
      setNewKey("")
      setEditJson("{}")
      setEditLabel("")
      setEditDesc("")
      load()
    } catch (e) {
      setFlash(`❌ ${e instanceof Error ? e.message : "Failed to create"}`)
    }
    setSaving(false)
  }

  async function deleteEntry(key: string) {
    if (!confirm(`Delete config "${key}"? This cannot be undone.`)) return
    try {
      await configApi.delete(key)
      setFlash(`🗑️ Deleted "${key}"`)
      setTimeout(() => setFlash(null), 3000)
      load()
    } catch (e) {
      setFlash(`❌ ${e instanceof Error ? e.message : "Failed to delete"}`)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-1">Site Maintenance</h1>
      <p className="text-gray-600 text-sm mb-6">
        Edit letter templates, reference data, and site settings.
        Changes take effect immediately — no deploy needed.
      </p>

      {/* Flash message */}
      {flash && (
        <div className="mb-4 px-4 py-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
          {flash}
        </div>
      )}

      {/* Category tabs */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            !activeCategory ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All ({categories.reduce((a, c) => a + c.count, 0)})
        </button>
        {categories.map(c => {
          const meta = CATEGORY_META[c.category]
          return (
            <button
              key={c.category}
              onClick={() => setActiveCategory(c.category)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                activeCategory === c.category
                  ? "bg-gray-800 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {meta?.icon} {meta?.label ?? c.category} ({c.count})
            </button>
          )
        })}
        <button
          onClick={() => {
            setCreating(true)
            setEditing(null)
            setEditJson("{}")
            setEditLabel("")
            setEditDesc("")
            setJsonError(null)
          }}
          className="ml-auto px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
        >
          ＋ New Entry
        </button>
      </div>

      {/* Category description */}
      {activeCategory && CATEGORY_META[activeCategory] && (
        <div className="bg-gray-50 border rounded-lg p-4 mb-6 text-sm text-gray-600">
          {CATEGORY_META[activeCategory].description}
        </div>
      )}

      {/* ── NEW ENTRY FORM ── */}
      {creating && (
        <div className="border rounded-xl p-6 bg-white mb-6">
          <h2 className="text-lg font-semibold mb-4">Create New Config Entry</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Key <span className="text-red-400">*</span></label>
              <input className="w-full border rounded px-3 py-2 text-sm font-mono" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="e.g. letter.appeal_template" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                <option value="letter_templates">Letter Templates</option>
                <option value="reference_data">Reference Data</option>
                <option value="site_settings">Site Settings</option>
                <option value="charity_care">Charity Care</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Label</label>
              <input className="w-full border rounded px-3 py-2 text-sm" value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="Human-readable name" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <input className="w-full border rounded px-3 py-2 text-sm" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="What this config controls" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Value (JSON)</label>
            <textarea
              className={`w-full border rounded px-3 py-2 text-sm font-mono ${jsonError ? "border-red-400" : ""}`}
              rows={8}
              value={editJson}
              onChange={e => { setEditJson(e.target.value); validateJson(e.target.value) }}
            />
            {jsonError && <p className="text-xs text-red-500 mt-1">{jsonError}</p>}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={createEntry} disabled={saving} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Create Entry"}
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}

      {/* ── EDIT FORM ── */}
      {editing && (
        <div className="border rounded-xl p-6 bg-white mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Edit: {editing.label || editing.key}</h2>
              <p className="text-xs text-gray-400 font-mono">{editing.key}</p>
            </div>
            <button onClick={() => setEditing(null)} className="text-xs text-gray-400 hover:text-gray-600">✕ Close</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Label</label>
              <input className="w-full border rounded px-3 py-2 text-sm" value={editLabel} onChange={e => setEditLabel(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <input className="w-full border rounded px-3 py-2 text-sm" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Value (JSON)</label>
            <textarea
              className={`w-full border rounded px-3 py-2 text-sm font-mono ${jsonError ? "border-red-400" : ""}`}
              rows={12}
              value={editJson}
              onChange={e => { setEditJson(e.target.value); validateJson(e.target.value) }}
            />
            {jsonError && <p className="text-xs text-red-500 mt-1">{jsonError}</p>}
          </div>

          {/* Template variable preview for letter_templates */}
          {editing.category === "letter_templates" && (
            <TemplatePreview json={editJson} />
          )}

          <div className="flex gap-3 mt-4">
            <button onClick={saveEdit} disabled={saving} className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}

      {/* ── ENTRY LIST ── */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="space-y-3">
          {entries.map(e => {
            const meta = CATEGORY_META[e.category]
            return (
              <div key={e.key} className="border rounded-lg p-4 hover:border-blue-300 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{meta?.icon ?? "📄"}</span>
                      <span className="font-semibold text-sm">{e.label || e.key}</span>
                      <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        {meta?.label ?? e.category}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-mono mb-1">{e.key}</p>
                    {e.description && (
                      <p className="text-xs text-gray-500">{e.description}</p>
                    )}
                    <div className="mt-2 text-[10px] text-gray-400">
                      Updated: {e.updatedAt ? new Date(e.updatedAt).toLocaleString() : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <button
                      onClick={() => startEdit(e)}
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteEntry(e.key)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Value preview */}
                <details className="mt-2">
                  <summary className="text-xs text-blue-600 cursor-pointer hover:underline">Show value</summary>
                  <pre className="mt-1 bg-gray-50 border rounded p-3 text-[11px] text-gray-600 overflow-x-auto max-h-48">
                    {JSON.stringify(e.value, null, 2)}
                  </pre>
                </details>
              </div>
            )
          })}

          {entries.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-400 text-sm">
              No config entries yet. Click "New Entry" to create one.
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ── Template Preview ──

function TemplatePreview({ json }: { json: string }) {
  try {
    const parsed = JSON.parse(json)
    if (!parsed.body) return null

    const variables = parsed.variables ?? []
    const sampleValues: Record<string, string> = {
      date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      provider: "Memorial General Hospital",
      billed_amount: "$12,450.00",
      patient_name: "Jane Smith",
      patient_address: "123 Main St, Anytown, TX 75001",
      patient_contact: "(555) 123-4567 / jane@email.com",
      insurance_company: "Blue Cross Blue Shield",
      member_id: "ABC123456789",
      group_number: "GRP-001",
      dispute_details: "[Specific billing errors identified by analysis]",
      requested_adjustment: "$4,200.00",
    }

    let preview = parsed.body
    for (const v of variables) {
      preview = preview.replaceAll(`{{${v}}}`, sampleValues[v] ?? `[${v}]`)
    }

    return (
      <div className="mt-4">
        <label className="block text-xs text-gray-500 mb-1">📄 Letter Preview (with sample data)</label>
        <div className="bg-white border rounded p-4 text-sm whitespace-pre-wrap text-gray-700 max-h-96 overflow-y-auto font-serif leading-relaxed">
          {preview}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {variables.map((v: string) => (
            <span key={v} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono">
              {"{{" + v + "}}"}
            </span>
          ))}
        </div>
      </div>
    )
  } catch {
    return null
  }
}
