import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import {
  ComposableMap,
  Geographies,
  Geography,
} from "react-simple-maps"
import { charityCareData, type CharityCareState } from "@/data/charityCare"
import { fipsToState } from "@/data/fips"

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"

// 2024 Federal Poverty Level guidelines (48 contiguous states + DC)
// Source: https://aspe.hhs.gov/poverty-guidelines
const FPL_BASE = 15060      // base for household of 1
const FPL_PER_PERSON = 5380 // added per additional person
// Alaska and Hawaii have higher FPL levels
const FPL_BASE_AK = 18810
const FPL_PER_PERSON_AK = 6730
const FPL_BASE_HI = 17310
const FPL_PER_PERSON_HI = 6190

function getFplAmount(householdSize: number, state?: string): number {
  const size = Math.max(1, householdSize)
  if (state === "AK") return FPL_BASE_AK + FPL_PER_PERSON_AK * (size - 1)
  if (state === "HI") return FPL_BASE_HI + FPL_PER_PERSON_HI * (size - 1)
  return FPL_BASE + FPL_PER_PERSON * (size - 1)
}

function getFplPercent(income: number, householdSize: number, state?: string): number {
  const fpl = getFplAmount(householdSize, state)
  return Math.round((income / fpl) * 100)
}

// All state abbreviations for the mobile dropdown
const ALL_STATES = Object.values(charityCareData).sort((a, b) =>
  a.name.localeCompare(b.name)
)

function getStateColor(st: CharityCareState | undefined): string {
  if (!st) return "#D1D5DB"
  if (st.hasMandatoryCharityCare && st.fplThreshold && st.fplThreshold >= 300)
    return "#6EE7A0" // strong: muted green
  if (st.hasMandatoryCharityCare)
    return "#FDE68A" // moderate: muted yellow
  return "#FCA5A5" // no mandate: muted red
}

export default function CharityCare() {
  const [selected, setSelected] = useState<CharityCareState | null>(null)

  // Calculator state
  const [calcHousehold, setCalcHousehold] = useState("")
  const [calcIncome, setCalcIncome] = useState("")
  const [calcState, setCalcState] = useState("")

  const calcResult = useMemo(() => {
    const hs = parseInt(calcHousehold)
    const inc = parseFloat(calcIncome)
    if (!hs || hs < 1 || !inc || inc < 0) return null

    const pct = getFplPercent(inc, hs, calcState || undefined)
    const stateData = calcState ? charityCareData[calcState] : null

    // Federal: most nonprofit FAPs cover 200% FPL for free, up to 400% for reduced
    const federalFree = pct <= 200
    const federalReduced = pct <= 400

    // State-specific thresholds
    let stateFree = false
    let stateReduced = false
    let stateName = ""
    if (stateData) {
      stateName = stateData.name
      if (stateData.fplThreshold && pct <= stateData.fplThreshold) stateFree = true
      if (stateData.reducedCareThreshold && pct <= stateData.reducedCareThreshold) stateReduced = true
    }

    return { pct, federalFree, federalReduced, stateFree, stateReduced, stateData, stateName, fplDollar: getFplAmount(hs, calcState || undefined) }
  }, [calcHousehold, calcIncome, calcState])

  function handleStateClick(stateAbbrev: string) {
    const data = charityCareData[stateAbbrev]
    if (data) setSelected(data)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">Know Your Rights</h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Every nonprofit hospital in America must offer financial assistance.
          Many states go further. Click your state to see what protections you have.
        </p>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-6 mb-6 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-300" />
          Strong (≥300% FPL)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-yellow-200" />
          Moderate mandate
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-300" />
          Federal only
        </div>
      </div>

      {/* Map + State Panel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-12">
        {/* Mobile state dropdown (visible below lg) */}
        <div className="lg:hidden">
          <select
            className="w-full border rounded px-3 py-2.5 text-base"
            value={selected?.state || ""}
            onChange={(e) => handleStateClick(e.target.value)}
          >
            <option value="">Select your state...</option>
            {ALL_STATES.map((st) => (
              <option key={st.state} value={st.state}>
                {st.name}
              </option>
            ))}
          </select>
        </div>

        {/* Map (hidden on small screens) */}
        <div className="hidden lg:block lg:col-span-3">
          <ComposableMap projection="geoAlbersUsa" width={800} height={500}>
            <g>
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const fips = geo.id
                    const stAbbrev = fipsToState[fips]
                    const stData = stAbbrev
                      ? charityCareData[stAbbrev]
                      : undefined
                    const isSelected = selected?.state === stAbbrev

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onClick={() => stAbbrev && handleStateClick(stAbbrev)}
                        style={{
                          default: {
                            fill: isSelected
                              ? "#1D4ED8"
                              : getStateColor(stData),
                            stroke: "#fff",
                            strokeWidth: 0.5,
                            outline: "none",
                          },
                          hover: {
                            fill: "#1D4ED8",
                            stroke: "#fff",
                            strokeWidth: 0.5,
                            outline: "none",
                            cursor: "pointer",
                          },
                          pressed: {
                            fill: "#1E3A5F",
                            outline: "none",
                          },
                        }}
                      />
                    )
                  })
                }
              </Geographies>
            </g>
          </ComposableMap>
        </div>

        {/* State Detail Panel */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="border rounded-lg p-6 h-full">
              <h2 className="text-xl font-bold mb-1">{selected.name}</h2>

              {/* Badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                {selected.hasMandatoryCharityCare && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                    Mandatory charity care
                  </span>
                )}
                {selected.collectionsProtections && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                    Collections protections
                  </span>
                )}
                {selected.surpriseBillingLaw && (
                  <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                    Surprise billing law
                  </span>
                )}
                {!selected.hasMandatoryCharityCare && (
                  <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                    No state mandate
                  </span>
                )}
              </div>

              {/* FPL Thresholds */}
              {(selected.fplThreshold || selected.reducedCareThreshold) && (
                <div className="bg-green-50 border border-green-200 rounded p-3 mb-4">
                  {selected.fplThreshold && (
                    <div className="text-sm">
                      <strong>Free care:</strong> up to {selected.fplThreshold}% FPL
                    </div>
                  )}
                  {selected.reducedCareThreshold && (
                    <div className="text-sm">
                      <strong>Reduced cost:</strong> up to{" "}
                      {selected.reducedCareThreshold}% FPL
                    </div>
                  )}
                </div>
              )}

              <p className="text-sm text-gray-700 mb-4">{selected.summary}</p>

              {/* Key provisions */}
              <h3 className="font-semibold text-sm mb-2">Key Provisions</h3>
              <ul className="text-sm space-y-1 mb-4">
                {selected.keyProvisions.map((p, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    {p}
                  </li>
                ))}
              </ul>

              {selected.statute && (
                <div className="text-xs text-gray-500 mb-4">
                  Statute: {selected.statute}
                </div>
              )}

              {/* What To Do Next */}
              <h3 className="font-semibold text-sm mb-2">What To Do Next</h3>
              <ol className="text-sm space-y-1 list-decimal list-inside mb-4">
                <li>Ask the hospital for their Financial Assistance Policy</li>
                <li>Complete the hospital's financial assistance application</li>
                <li>Request an itemized bill — just asking for one often causes charges to drop</li>
                <li><Link to="/documents" className="text-blue-600 hover:underline">See what documents to request</Link> and why they matter</li>
              </ol>

              <Link
                to="/cases"
                className="block text-center bg-blue-600 text-white py-2 px-4 rounded text-sm hover:bg-blue-700"
              >
                Submit my case →
              </Link>
            </div>
          ) : (
            <div className="border rounded-lg p-6 h-full flex flex-col">
              <div className="text-center mb-6">
                <span className="text-4xl mb-3 block">🗺️</span>
                <h2 className="font-semibold text-lg mb-1">Click any state to get started</h2>
                <p className="text-sm text-gray-500">
                  We'll show you the charity care laws, income limits, and billing protections where you live.
                </p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-3">
                <p className="text-sm text-gray-700">
                  <strong className="text-green-800">Most people don't know this:</strong> if you're uninsured or have a low income, you may already qualify for free or reduced-cost care — even if you've already been billed.
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 space-y-3 flex-1">
                <p className="font-medium text-gray-700 text-xs uppercase tracking-wider">What the colors mean</p>
                <div className="flex items-start gap-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-green-400 mt-1 shrink-0"></span>
                  <p><strong>Strong</strong> — State law requires <em>all</em> hospitals (including for-profit) to offer financial assistance, which means you may qualify for free or reduced-cost care.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-yellow-400 mt-1 shrink-0"></span>
                  <p><strong>Moderate</strong> — Some state protections exist. Federal law still covers nonprofit hospitals, which means you may qualify for free or reduced-cost care.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-red-400 mt-1 shrink-0"></span>
                  <p><strong>Weak</strong> — Limited state law, but <strong>federal law still applies</strong> — every nonprofit hospital must offer a Financial Assistance Policy, which means you may qualify for free or reduced-cost care. Most major hospitals are nonprofits.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ FPL CALCULATOR ═══ */}
      <div id="calculator" className="mb-16">
        <h2 className="text-2xl font-bold text-center mb-2">
          Check If You Qualify
        </h2>
        <p className="text-center text-gray-600 mb-6 max-w-2xl mx-auto">
          Enter your household info to see if you may be eligible for free or reduced-cost hospital care.
        </p>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8 max-w-2xl mx-auto text-sm text-gray-700">
          <strong>This is the single most important thing you can do.</strong> Applying for financial assistance (the hospital's FAP) can eliminate your entire bill — and it's more likely to help you than finding coding errors or negotiating.
          Call the hospital's billing department and ask for their Financial Assistance Program application. Fill it out and send it back to them.
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Household Size</label>
              <input
                type="number"
                min="1"
                max="20"
                placeholder="e.g. 4"
                value={calcHousehold}
                onChange={(e) => setCalcHousehold(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Annual Income</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 45000"
                  value={calcIncome}
                  onChange={(e) => setCalcIncome(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State <span className="text-gray-400 font-normal">(optional)</span></label>
              <select
                value={calcState}
                onChange={(e) => setCalcState(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">— Select state —</option>
                {ALL_STATES.map((s) => (
                  <option key={s.state} value={s.state}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Results */}
          {calcResult && (
            <div className="border rounded-lg overflow-hidden">
              {/* FPL bar */}
              <div className="p-5">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Your Federal Poverty Level</span>
                  <span className="text-2xl font-bold text-gray-900">{calcResult.pct}% FPL</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 mb-1">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ${
                      calcResult.pct <= 200 ? "bg-green-400" : calcResult.pct <= 400 ? "bg-yellow-400" : "bg-red-400"
                    }`}
                    style={{ width: `${Math.min(calcResult.pct / 5, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mb-4">
                  <span>0%</span>
                  <span>200% (free care)</span>
                  <span>400% (reduced)</span>
                  <span>500%+</span>
                </div>

                <p className="text-xs text-gray-500">
                  The FPL for a household of {calcHousehold} is <strong>${calcResult.fplDollar.toLocaleString()}/year</strong>.
                  Your income of <strong>${parseFloat(calcIncome).toLocaleString()}</strong> puts you at <strong>{calcResult.pct}%</strong> of that level.
                </p>
              </div>

              {/* Eligibility results */}
              <div className="border-t bg-gray-50 p-5 space-y-3">
                {/* Federal eligibility */}
                {calcResult.federalFree ? (
                  <div className="flex items-start gap-2">
                    <span className="text-green-500 text-lg leading-none mt-0.5">✅</span>
                    <p className="text-sm text-gray-700">
                      <strong>You very likely qualify for free care</strong> at nonprofit hospitals under federal law. Most hospitals' Financial Assistance Policies cover patients at or below 200% FPL.
                    </p>
                  </div>
                ) : calcResult.federalReduced ? (
                  <div className="flex items-start gap-2">
                    <span className="text-yellow-500 text-lg leading-none mt-0.5">🟡</span>
                    <p className="text-sm text-gray-700">
                      <strong>You may qualify for reduced-cost care</strong> at nonprofit hospitals. Many FAPs offer sliding-scale discounts up to 400% FPL.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <span className="text-gray-400 text-lg leading-none mt-0.5">ℹ️</span>
                    <p className="text-sm text-gray-700">
                      At {calcResult.pct}% FPL, you're above the typical FAP threshold — but it's still worth applying. Some hospitals have higher limits, and you can always negotiate.
                    </p>
                  </div>
                )}

                {/* State-specific eligibility */}
                {calcResult.stateData && (
                  <>
                    {calcResult.stateFree ? (
                      <div className="flex items-start gap-2">
                        <span className="text-green-500 text-lg leading-none mt-0.5">✅</span>
                        <p className="text-sm text-gray-700">
                          <strong>{calcResult.stateName} state law</strong> requires hospitals to provide free care at your income level
                          {calcResult.stateData.fplThreshold && ` (covers up to ${calcResult.stateData.fplThreshold}% FPL)`}.
                          {calcResult.stateData.hasMandatoryCharityCare && " This applies to all hospitals, not just nonprofits."}
                        </p>
                      </div>
                    ) : calcResult.stateReduced ? (
                      <div className="flex items-start gap-2">
                        <span className="text-yellow-500 text-lg leading-none mt-0.5">🟡</span>
                        <p className="text-sm text-gray-700">
                          <strong>{calcResult.stateName}</strong> offers reduced-cost care up to {calcResult.stateData.reducedCareThreshold}% FPL. You qualify for discounted rates under state law.
                        </p>
                      </div>
                    ) : calcResult.stateData.hasMandatoryCharityCare ? (
                      <div className="flex items-start gap-2">
                        <span className="text-gray-400 text-lg leading-none mt-0.5">ℹ️</span>
                        <p className="text-sm text-gray-700">
                          {calcResult.stateName} has charity care laws, but your income is above the state threshold. Federal FAP protections at nonprofit hospitals still apply.
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <span className="text-gray-400 text-lg leading-none mt-0.5">ℹ️</span>
                        <p className="text-sm text-gray-700">
                          {calcResult.stateName} doesn't have a state charity care mandate, but federal law still requires every nonprofit hospital to have a Financial Assistance Policy.
                        </p>
                      </div>
                    )}

                    {calcResult.stateData.collectionsProtections && (
                      <div className="flex items-start gap-2">
                        <span className="text-blue-500 text-lg leading-none mt-0.5">🛡️</span>
                        <p className="text-sm text-gray-700">
                          {calcResult.stateName} has <strong>collections protections</strong> — limits on wage garnishment, liens, or aggressive collection actions for medical debt.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* CTA */}
                <div className="pt-3 space-y-3">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-gray-800 font-semibold mb-1">📞 Your most important next step</p>
                    <p className="text-sm text-gray-700">
                      Call the hospital's billing department and ask for their <strong>Financial Assistance Program (FAP) application</strong>. Fill it out and send it back to them. This alone can reduce or eliminate your entire bill.
                    </p>
                  </div>
                  <Link
                    to="/cases"
                    className="inline-block bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    Submit my bill for review →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!calcResult && (
            <div className="border-2 border-dashed rounded-lg p-8 text-center text-gray-400 text-sm">
              Enter your household size and income above to see your results.
            </div>
          )}
        </div>
      </div>

      {/* ═══ WARNINGS SECTION ═══ */}
      <div id="warnings" className="mb-16">
        <h2 className="text-2xl font-bold text-center mb-2">
          Before You Pay Anything
        </h2>
        <p className="text-center text-gray-600 mb-8 max-w-2xl mx-auto">
          Three things you should know before doing anything with a medical bill.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Card 1: Don't Pay */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="text-2xl mb-3">🛑</div>
            <h3 className="font-bold text-lg mb-2">You Probably Don't Have to Pay Right Away</h3>
            <p className="text-sm text-gray-700 mb-3">
              Most hospital bills have errors, and you have the
              right to request an itemized bill and dispute any charges.
              There's usually more time than you think.
            </p>
            <ul className="text-sm space-y-1.5">
              <li className="flex gap-2">
                <span className="text-blue-500">→</span>
                Request an itemized bill (not just a summary) — just asking often causes charges to drop
              </li>
              <li className="flex gap-2">
                <span className="text-blue-500">→</span>
                Ask for the hospital's Financial Assistance Policy
              </li>
              <li className="flex gap-2">
                <span className="text-blue-500">→</span>
                Bills often have 90–180 days before collections
              </li>
            </ul>
          </div>

          {/* Card 2: CareCredit WARNING */}
          <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-6">
            <div className="text-2xl mb-3">⚠️</div>
            <h3 className="font-bold text-lg mb-2">
              Don't Sign CareCredit or Medical Financing
            </h3>
            <p className="text-sm text-gray-700 mb-3">
              Hospitals push medical credit cards at the point of service. These
              are high-interest loans that waive your dispute rights.
            </p>
            <ul className="text-sm space-y-1.5">
              <li className="flex gap-2">
                <span className="text-amber-600">→</span>
                CareCredit charges 26.99% APR after promo period
              </li>
              <li className="flex gap-2">
                <span className="text-amber-600">→</span>
                Signing transfers your debt from hospital to a bank
              </li>
              <li className="flex gap-2">
                <span className="text-amber-600">→</span>
                You lose your right to dispute with the hospital
              </li>
            </ul>
            <div className="mt-3 text-xs text-amber-700 bg-amber-100 rounded p-2">
              💡 Already signed? You may have a <strong>3-day right to cancel</strong>{" "}
              under TILA (Truth in Lending Act) for in-person credit.
            </div>
          </div>

          {/* Card 3: Collections */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="text-2xl mb-3">📞</div>
            <h3 className="font-bold text-lg mb-2">
              Collections Isn't Always the Worst Option
            </h3>
            <p className="text-sm text-gray-700 mb-3">
              Medical debt has special protections. It's often better to let a
              bill go to collections than to sign predatory financing like CareCredit.
            </p>
            <ul className="text-sm space-y-1.5">
              <li className="flex gap-2">
                <span className="text-blue-500">→</span>
                Medical debt under $500 can't go on credit reports
              </li>
              <li className="flex gap-2">
                <span className="text-blue-500">→</span>
                1-year delay before medical debt hits credit (since 2023)
              </li>
              <li className="flex gap-2">
                <span className="text-blue-500">→</span>
                Paid medical collections removed from credit reports
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* ═══ FQHC SECTION ═══ */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-center mb-2">
          Federally Qualified Health Centers (FQHCs)
        </h2>
        <p className="text-center text-gray-600 mb-8 max-w-2xl mx-auto">
          FQHCs are required by law to serve everyone regardless of ability to pay.
          They use a sliding fee scale based on your income.
        </p>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6 max-w-3xl mx-auto">
          <h3 className="font-bold text-lg mb-3">How the sliding fee scale works:</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-3">
              <span className="bg-green-600 text-white text-xs font-bold px-2 py-1 rounded w-24 text-center">
                ≤100% FPL
              </span>
              <span>Nominal fee only (typically $20–$40)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded w-24 text-center">
                101–150%
              </span>
              <span>Significant discount (often 75% off)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-green-400 text-white text-xs font-bold px-2 py-1 rounded w-24 text-center">
                151–200%
              </span>
              <span>Moderate discount (often 50% off)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-green-300 text-xs font-bold px-2 py-1 rounded w-24 text-center">
                &gt;200%
              </span>
              <span>Full charges (still typically cheaper than hospitals)</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-green-200">
            <a
              href="https://findahealthcenter.hrsa.gov/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-700 font-semibold hover:underline"
            >
              🔍 Find an FQHC near you → findahealthcenter.hrsa.gov
            </a>
          </div>
        </div>
      </div>

      {/* ═══ HOSPITAL HIERARCHY ═══ */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-center mb-2">
          Not All Hospitals Are the Same
        </h2>
        <p className="text-center text-gray-600 mb-8 max-w-2xl mx-auto">
          Your rights depend on the type of hospital. Nonprofit hospitals have the
          most obligations to patients.
        </p>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="border rounded-lg p-5">
            <div className="text-2xl mb-2">🏥</div>
            <h3 className="font-bold mb-1">Nonprofit Hospitals</h3>
            <p className="text-xs text-gray-500 mb-2">~58% of US hospitals</p>
            <p className="text-sm text-gray-700">
              Must comply with IRS 501(r): publish FAP, offer financial assistance,
              limit charges to insured rates for eligible patients, no extraordinary
              collections without screening.
            </p>
          </div>

          <div className="border rounded-lg p-5">
            <div className="text-2xl mb-2">🏢</div>
            <h3 className="font-bold mb-1">For-Profit Hospitals</h3>
            <p className="text-xs text-gray-500 mb-2">~25% of US hospitals</p>
            <p className="text-sm text-gray-700">
              No 501(r) requirements. Some states require financial assistance
              regardless. Otherwise, you're limited to negotiation and state
              consumer protection laws.
            </p>
          </div>

          <div className="border rounded-lg p-5">
            <div className="text-2xl mb-2">🏛️</div>
            <h3 className="font-bold mb-1">Government Hospitals</h3>
            <p className="text-xs text-gray-500 mb-2">~17% of US hospitals</p>
            <p className="text-sm text-gray-700">
              County and public hospitals often have the most generous financial
              assistance. Many are required by their charter to serve all patients
              regardless of ability to pay.
            </p>
          </div>
        </div>
      </div>

      {/* ═══ 501(r) EXPLAINER ═══ */}
      <div className="mb-16">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-3">
            What Is IRS Section 501(r)?
          </h2>
          <p className="text-sm text-gray-700 mb-4">
            Section 501(r) of the Internal Revenue Code requires every nonprofit
            hospital to meet four requirements to keep their tax-exempt status:
          </p>
          <ol className="text-sm space-y-3 list-decimal list-inside">
            <li>
              <strong>Financial Assistance Policy (FAP)</strong> — Must establish
              and widely publicize a written policy describing eligibility criteria,
              discounts offered, and how to apply.
            </li>
            <li>
              <strong>Limitation on Charges</strong> — Cannot charge FAP-eligible
              patients more than amounts generally billed to insured patients
              (the "AGB" — amounts generally billed).
            </li>
            <li>
              <strong>Billing and Collection Limits</strong> — Must make
              reasonable efforts to determine FAP eligibility before engaging in
              extraordinary collection actions (lawsuits, liens, wage garnishment,
              credit reporting).
            </li>
            <li>
              <strong>Community Health Needs Assessment</strong> — Must conduct a
              CHNA every three years and adopt an implementation strategy.
            </li>
          </ol>
          <div className="mt-4 text-xs text-gray-500">
            Violation of 501(r) can result in loss of tax-exempt status. If your
            nonprofit hospital didn't offer you financial assistance before sending
            you to collections, they may be in violation.
          </div>
        </div>
      </div>
    </div>
  )
}