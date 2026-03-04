import { useState, useRef, useEffect } from "react"

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
}

const STATE_ENTRIES = Object.entries(US_STATES)

interface StateSelectProps {
  value: string
  onChange: (abbr: string) => void
  required?: boolean
  placeholder?: string
  className?: string
  /** compact mode for inline editing (smaller padding, no label) */
  compact?: boolean
}

export default function StateSelect({
  value,
  onChange,
  required = false,
  placeholder = "Select state…",
  className = "",
  compact = false,
}: StateSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [highlightIdx, setHighlightIdx] = useState(0)

  const displayValue = value ? `${value} — ${US_STATES[value] ?? value}` : ""

  const filtered = search.trim()
    ? STATE_ENTRIES.filter(([abbr, name]) => {
        const q = search.trim().toLowerCase()
        return abbr.toLowerCase().includes(q) || name.toLowerCase().includes(q)
      })
    : STATE_ENTRIES

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Reset highlight when filtered list changes
  useEffect(() => { setHighlightIdx(0) }, [filtered.length])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return
    const items = listRef.current.children
    if (items[highlightIdx]) {
      (items[highlightIdx] as HTMLElement).scrollIntoView({ block: "nearest" })
    }
  }, [highlightIdx, open])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (filtered[highlightIdx]) {
        onChange(filtered[highlightIdx][0])
        setOpen(false)
        setSearch("")
      }
    } else if (e.key === "Escape") {
      setOpen(false)
      setSearch("")
    }
  }

  function handleSelect(abbr: string) {
    onChange(abbr)
    setOpen(false)
    setSearch("")
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange("")
    setSearch("")
  }

  const py = compact ? "py-1.5" : "py-2"
  const textSize = compact ? "text-sm" : "text-sm"

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => {
          setOpen(!open)
          if (!open) setTimeout(() => inputRef.current?.focus(), 0)
        }}
        className={`w-full border border-gray-300 rounded-lg px-3 ${py} ${textSize} text-left flex items-center justify-between
          focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:border-gray-400 transition-colors
          ${!value ? "text-gray-400" : "text-gray-900"}`}
      >
        <span className="truncate">{displayValue || placeholder}</span>
        <span className="flex items-center gap-1 shrink-0 ml-2">
          {value && !required && (
            <span
              role="button"
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 text-xs leading-none"
              title="Clear"
            >
              ✕
            </span>
          )}
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
          </svg>
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search states…"
              className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              autoComplete="off"
            />
          </div>

          {/* Options */}
          <ul
            ref={listRef}
            className="max-h-48 overflow-y-auto py-1"
          >
            {!required && (
              <li
                onClick={() => handleSelect("")}
                className={`px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between
                  ${!value ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-400"}`}
              >
                <span className="italic">None</span>
              </li>
            )}
            {filtered.map(([abbr, name], i) => (
              <li
                key={abbr}
                onClick={() => handleSelect(abbr)}
                className={`px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between
                  ${i === highlightIdx ? "bg-blue-50" : "hover:bg-gray-50"}
                  ${abbr === value ? "text-blue-700 font-medium" : "text-gray-700"}`}
              >
                <span>{name}</span>
                <span className="text-xs text-gray-400 ml-2 font-mono">{abbr}</span>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-sm text-gray-400 text-center">
                No states match "{search}"
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export { US_STATES }
