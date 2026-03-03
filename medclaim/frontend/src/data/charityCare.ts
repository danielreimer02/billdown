/**
 * Charity care / financial assistance rules by state.
 *
 * Every nonprofit hospital must offer charity care under IRS 501(r).
 * Many states go further with specific income thresholds and protections.
 *
 * Sources:
 * - National Consumer Law Center
 * - State AG offices
 * - CMS hospital compliance data
 * - Individual state statutes (cited per entry)
 */

export interface CharityCareState {
  state: string           // two-letter code
  name: string
  hasMandatoryCharityCare: boolean
  fplThreshold: number | null      // % of Federal Poverty Level for free care
  reducedCareThreshold: number | null  // % FPL for reduced-cost care
  summary: string
  keyProvisions: string[]
  statute: string | null
  collectionsProtections: boolean   // limits on collections/wage garnishment
  surpriseBillingLaw: boolean
}

export const charityCareData: Record<string, CharityCareState> = {
  AL: {
    state: "AL", name: "Alabama",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Alabama has no state charity care mandate. Nonprofit hospitals must comply with federal 501(r) requirements only.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "No state-level FPL threshold"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  AK: {
    state: "AK", name: "Alaska",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Alaska has no state charity care law. The higher cost of living makes federal 501(r) protections especially important.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Higher FPL levels due to Alaska adjustment"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  AZ: {
    state: "AZ", name: "Arizona",
    hasMandatoryCharityCare: true, fplThreshold: 100, reducedCareThreshold: 200,
    summary: "Arizona requires hospitals to provide discounted care. AHCCCS (Medicaid) expansion covers many low-income residents.",
    keyProvisions: ["Hospitals must post financial assistance policies", "AHCCCS covers up to 138% FPL", "Emergency care protections"],
    statute: "ARS § 36-2903.01", collectionsProtections: true, surpriseBillingLaw: true,
  },
  AR: {
    state: "AR", name: "Arkansas",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Arkansas has no state charity care mandate. Arkansas Works (Medicaid expansion) covers adults up to 138% FPL.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Arkansas Works Medicaid expansion"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  CA: {
    state: "CA", name: "California",
    hasMandatoryCharityCare: true, fplThreshold: 400, reducedCareThreshold: 400,
    summary: "California has the strongest charity care law in the nation. Free care required up to 400% FPL. Hospitals cannot bill more than what insurance would have paid.",
    keyProvisions: [
      "Free care for patients up to 400% FPL at nonprofit hospitals",
      "Cannot charge uninsured patients more than insured rates",
      "Hospital Fair Pricing Act limits bills",
      "No collections until financial assistance screening complete",
      "Must screen all emergency/uninsured patients",
    ],
    statute: "Health & Safety Code § 127400-127446", collectionsProtections: true, surpriseBillingLaw: true,
  },
  CO: {
    state: "CO", name: "Colorado",
    hasMandatoryCharityCare: true, fplThreshold: 250, reducedCareThreshold: 300,
    summary: "Colorado's Hospital Discounted Care program requires discounts for low-income patients. Strong consumer protections.",
    keyProvisions: [
      "Free care up to 250% FPL",
      "Discounted care up to 300% FPL",
      "Hospitals must screen patients before collections",
      "CoverColorado for uninsurable patients",
    ],
    statute: "CRS § 25.5-3-501", collectionsProtections: true, surpriseBillingLaw: true,
  },
  CT: {
    state: "CT", name: "Connecticut",
    hasMandatoryCharityCare: true, fplThreshold: 250, reducedCareThreshold: 400,
    summary: "Connecticut requires hospitals to provide free or reduced-cost care. Bed debt protections prevent aggressive collections.",
    keyProvisions: [
      "Free care for patients up to 250% FPL",
      "Reduced care up to 400% FPL",
      "Hospitals must offer payment plans",
      "Cannot use extraordinary collection actions until 180 days",
    ],
    statute: "CGS § 19a-673", collectionsProtections: true, surpriseBillingLaw: true,
  },
  DE: {
    state: "DE", name: "Delaware",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Delaware has no state charity care mandate. Federal 501(r) requirements apply to nonprofit hospitals.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion covers up to 138% FPL"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  DC: {
    state: "DC", name: "District of Columbia",
    hasMandatoryCharityCare: true, fplThreshold: 200, reducedCareThreshold: 300,
    summary: "DC requires hospitals to provide charity care and has strong consumer protections including surprise billing limits.",
    keyProvisions: [
      "Free care up to 200% FPL",
      "Reduced-cost care up to 300% FPL",
      "DC Healthcare Alliance for uninsured residents",
    ],
    statute: "DC Code § 44-731", collectionsProtections: true, surpriseBillingLaw: true,
  },
  FL: {
    state: "FL", name: "Florida",
    hasMandatoryCharityCare: true, fplThreshold: 100, reducedCareThreshold: 200,
    summary: "Florida requires hospitals receiving state funds to provide charity care. No Medicaid expansion narrows the coverage gap.",
    keyProvisions: [
      "Hospitals must have financial assistance policies",
      "Taxpayer-funded hospitals must provide charity care",
      "No Medicaid expansion — coverage gap exists",
    ],
    statute: "FL Stat § 395.1041", collectionsProtections: false, surpriseBillingLaw: true,
  },
  GA: {
    state: "GA", name: "Georgia",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Georgia has no state charity care mandate and has not expanded Medicaid, leaving a significant coverage gap.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "No Medicaid expansion", "Pathways to Coverage waiver program"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: true,
  },
  HI: {
    state: "HI", name: "Hawaii",
    hasMandatoryCharityCare: true, fplThreshold: 100, reducedCareThreshold: 300,
    summary: "Hawaii's Prepaid Health Care Act (1974) requires employer-provided insurance — the oldest such mandate in the US.",
    keyProvisions: [
      "Employer health insurance mandate (oldest in US)",
      "QUEST Integration Medicaid covers up to 138% FPL",
      "Very low uninsured rate",
    ],
    statute: "HRS § 393", collectionsProtections: true, surpriseBillingLaw: false,
  },
  ID: {
    state: "ID", name: "Idaho",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Idaho has no state charity care mandate. Medicaid expansion (2020) covers adults up to 138% FPL.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion since 2020"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  IL: {
    state: "IL", name: "Illinois",
    hasMandatoryCharityCare: true, fplThreshold: 200, reducedCareThreshold: 600,
    summary: "Illinois has one of the strongest charity care laws. The Hospital Uninsured Patient Discount Act provides broad protections.",
    keyProvisions: [
      "Free care up to 200% FPL",
      "Discounted care up to 600% FPL",
      "Cannot charge uninsured more than insured rates",
      "12-month payment plan requirement",
      "All hospitals must participate (not just nonprofit)",
    ],
    statute: "210 ILCS 89", collectionsProtections: true, surpriseBillingLaw: true,
  },
  IN: {
    state: "IN", name: "Indiana",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Indiana has no state charity care mandate. HIP 2.0 (Healthy Indiana Plan) covers adults up to 138% FPL.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "HIP 2.0 Medicaid expansion"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  IA: {
    state: "IA", name: "Iowa",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Iowa has no state charity care mandate. Iowa Health and Wellness Plan covers adults up to 138% FPL.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Iowa Health and Wellness Plan"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  KS: {
    state: "KS", name: "Kansas",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Kansas has no state charity care mandate and has not expanded Medicaid.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "No Medicaid expansion"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  KY: {
    state: "KY", name: "Kentucky",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Kentucky has no specific charity care statute but expanded Medicaid covering adults up to 138% FPL.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion since 2014", "Kynect marketplace"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  LA: {
    state: "LA", name: "Louisiana",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Louisiana expanded Medicaid in 2016, dramatically reducing the uninsured rate. No separate state charity care mandate.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion since 2016", "Healthy Louisiana"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  ME: {
    state: "ME", name: "Maine",
    hasMandatoryCharityCare: true, fplThreshold: 150, reducedCareThreshold: 300,
    summary: "Maine requires hospitals to provide free and discounted care and has strong patient billing protections.",
    keyProvisions: [
      "Free care up to 150% FPL",
      "Discounted care up to 300% FPL",
      "Hospitals must screen all patients",
    ],
    statute: "22 MRSA § 1716", collectionsProtections: true, surpriseBillingLaw: false,
  },
  MD: {
    state: "MD", name: "Maryland",
    hasMandatoryCharityCare: true, fplThreshold: 200, reducedCareThreshold: 500,
    summary: "Maryland has a unique all-payer hospital rate system and strong charity care requirements. The Health Services Cost Review Commission sets rates.",
    keyProvisions: [
      "Free care up to 200% FPL",
      "Reduced-cost care up to 500% FPL",
      "All-payer rate regulation (unique in US)",
      "HSCRC sets hospital rates",
      "Cannot charge more than the regulated rate",
    ],
    statute: "Md. Code Health-Gen. § 19-214.1", collectionsProtections: true, surpriseBillingLaw: true,
  },
  MA: {
    state: "MA", name: "Massachusetts",
    hasMandatoryCharityCare: true, fplThreshold: 300, reducedCareThreshold: 400,
    summary: "Massachusetts has a health safety net that provides free care. Near-universal coverage through state mandate.",
    keyProvisions: [
      "Health Safety Net provides free care up to 300% FPL",
      "Partial coverage up to 400% FPL",
      "Individual mandate (since 2006)",
      "MassHealth covers up to 138% FPL",
    ],
    statute: "MGL Ch. 118E § 69", collectionsProtections: true, surpriseBillingLaw: true,
  },
  MI: {
    state: "MI", name: "Michigan",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Michigan has no state charity care mandate. Healthy Michigan Plan covers adults up to 138% FPL.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Healthy Michigan Plan (Medicaid expansion)"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  MN: {
    state: "MN", name: "Minnesota",
    hasMandatoryCharityCare: true, fplThreshold: 275, reducedCareThreshold: 275,
    summary: "Minnesota requires hospitals to provide charity care and has MinnesotaCare for low-income residents.",
    keyProvisions: [
      "Hospitals must provide charity care up to 275% FPL",
      "MinnesotaCare covers up to 200% FPL",
      "Must report charity care annually",
    ],
    statute: "Minn. Stat. § 144.699", collectionsProtections: true, surpriseBillingLaw: true,
  },
  MS: {
    state: "MS", name: "Mississippi",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Mississippi has no state charity care mandate and has not expanded Medicaid, leaving a large coverage gap.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "No Medicaid expansion", "Highest uninsured rate regionally"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  MO: {
    state: "MO", name: "Missouri",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Missouri expanded Medicaid in 2021 via ballot initiative. No separate state charity care mandate.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion since 2021 (ballot initiative)"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  MT: {
    state: "MT", name: "Montana",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Montana has no state charity care mandate. HELP Act expanded Medicaid to cover adults up to 138% FPL.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "HELP Act Medicaid expansion"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  NE: {
    state: "NE", name: "Nebraska",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Nebraska expanded Medicaid in 2020 via ballot initiative. No separate state charity care mandate.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion since 2020 (ballot initiative)"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  NV: {
    state: "NV", name: "Nevada",
    hasMandatoryCharityCare: true, fplThreshold: 200, reducedCareThreshold: 400,
    summary: "Nevada requires hospitals to provide financial assistance and has enacted surprise billing protections.",
    keyProvisions: [
      "Hospitals must have financial assistance policies",
      "Free care up to 200% FPL at nonprofit hospitals",
      "Surprise billing protections enacted 2019",
    ],
    statute: "NRS § 439B.260", collectionsProtections: true, surpriseBillingLaw: true,
  },
  NH: {
    state: "NH", name: "New Hampshire",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "New Hampshire has no state charity care mandate. Granite Advantage expanded Medicaid covers adults up to 138% FPL.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Granite Advantage Medicaid expansion"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  NJ: {
    state: "NJ", name: "New Jersey",
    hasMandatoryCharityCare: true, fplThreshold: 200, reducedCareThreshold: 300,
    summary: "New Jersey has strong charity care laws. Hospitals must provide free care and the state has a charity care fund.",
    keyProvisions: [
      "Free care up to 200% FPL",
      "Reduced-cost care up to 300% FPL",
      "State Charity Care Fund subsidizes hospitals",
      "Must screen all uninsured patients",
      "No liens on primary residences for medical debt",
    ],
    statute: "NJSA 26:2H-18.64", collectionsProtections: true, surpriseBillingLaw: true,
  },
  NM: {
    state: "NM", name: "New Mexico",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "New Mexico has no state charity care mandate. Medicaid expansion covers adults up to 138% FPL.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion", "High uninsured rate despite expansion"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: true,
  },
  NY: {
    state: "NY", name: "New York",
    hasMandatoryCharityCare: true, fplThreshold: 300, reducedCareThreshold: 400,
    summary: "New York has extensive patient protections including the Hospital Financial Assistance Law and surprise billing protections (first state to enact).",
    keyProvisions: [
      "Free care up to 300% FPL",
      "Reduced care up to 400% FPL",
      "First state with surprise billing law (2015)",
      "Essential Plan covers up to 200% FPL",
      "Hospitals cannot sue patients below 400% FPL",
    ],
    statute: "PBH § 2807-k", collectionsProtections: true, surpriseBillingLaw: true,
  },
  NC: {
    state: "NC", name: "North Carolina",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "North Carolina expanded Medicaid in 2023. No separate state charity care mandate.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion since December 2023"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  ND: {
    state: "ND", name: "North Dakota",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "North Dakota has no state charity care mandate. Medicaid expansion covers adults up to 138% FPL.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  OH: {
    state: "OH", name: "Ohio",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Ohio has no state charity care mandate. Medicaid expansion covers adults up to 138% FPL.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion since 2014"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  OK: {
    state: "OK", name: "Oklahoma",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Oklahoma expanded Medicaid in 2021 via ballot initiative (SoonerCare). No separate state charity care mandate.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "SoonerCare Medicaid expansion since 2021"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  OR: {
    state: "OR", name: "Oregon",
    hasMandatoryCharityCare: true, fplThreshold: 200, reducedCareThreshold: 400,
    summary: "Oregon requires hospitals to provide charity care and has the Oregon Health Plan for low-income residents.",
    keyProvisions: [
      "Free care up to 200% FPL",
      "Discounted care up to 400% FPL",
      "Oregon Health Plan (Medicaid) covers up to 138% FPL",
      "Must screen before sending to collections",
    ],
    statute: "ORS § 442.614", collectionsProtections: true, surpriseBillingLaw: true,
  },
  PA: {
    state: "PA", name: "Pennsylvania",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Pennsylvania has no state charity care mandate. Medicaid expansion covers adults up to 138% FPL.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion since 2015"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  RI: {
    state: "RI", name: "Rhode Island",
    hasMandatoryCharityCare: true, fplThreshold: 200, reducedCareThreshold: 300,
    summary: "Rhode Island requires hospitals to provide financial assistance and has a hospital licensing charity care requirement.",
    keyProvisions: [
      "Free care up to 200% FPL",
      "Reduced care up to 300% FPL",
      "Charity care required for hospital licensing",
    ],
    statute: "RIGL § 23-17-38.1", collectionsProtections: true, surpriseBillingLaw: false,
  },
  SC: {
    state: "SC", name: "South Carolina",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "South Carolina has no state charity care mandate and has not expanded Medicaid.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "No Medicaid expansion"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  SD: {
    state: "SD", name: "South Dakota",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "South Dakota expanded Medicaid in 2023 via ballot initiative. No separate state charity care mandate.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion since July 2023"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  TN: {
    state: "TN", name: "Tennessee",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Tennessee has no state charity care mandate and has not fully expanded Medicaid. TennCare covers limited populations.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "TennCare (limited Medicaid)", "No full Medicaid expansion"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  TX: {
    state: "TX", name: "Texas",
    hasMandatoryCharityCare: true, fplThreshold: null, reducedCareThreshold: null,
    summary: "Texas requires nonprofit hospitals to provide charity care in exchange for tax exemption. No Medicaid expansion — largest coverage gap in the US.",
    keyProvisions: [
      "Nonprofit hospitals must provide charity care equal to tax benefits",
      "No Medicaid expansion — largest uninsured state",
      "AG can investigate hospitals not meeting charity care obligations",
      "Property tax exemption tied to charity care",
    ],
    statute: "TX Health & Safety Code § 311.031", collectionsProtections: false, surpriseBillingLaw: true,
  },
  UT: {
    state: "UT", name: "Utah",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Utah expanded Medicaid in 2020 via ballot initiative. No separate state charity care mandate.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion since 2020"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  VT: {
    state: "VT", name: "Vermont",
    hasMandatoryCharityCare: true, fplThreshold: 300, reducedCareThreshold: 400,
    summary: "Vermont has strong patient protections and a hospital budget review process that includes charity care requirements.",
    keyProvisions: [
      "Free care up to 300% FPL",
      "Discounted care up to 400% FPL",
      "Green Mountain Care Board reviews hospital budgets",
      "Dr. Dynasaur covers children up to 312% FPL",
    ],
    statute: "18 VSA § 1912", collectionsProtections: true, surpriseBillingLaw: true,
  },
  VA: {
    state: "VA", name: "Virginia",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Virginia expanded Medicaid in 2019. No separate state charity care mandate.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion since 2019"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  WA: {
    state: "WA", name: "Washington",
    hasMandatoryCharityCare: true, fplThreshold: 300, reducedCareThreshold: 400,
    summary: "Washington has strong charity care requirements and recently enacted the Balance Billing Protection Act.",
    keyProvisions: [
      "Free care up to 300% FPL",
      "Discounted care up to 400% FPL",
      "Balance Billing Protection Act",
      "Apple Health (Medicaid) covers up to 138% FPL",
      "Must screen all patients before billing",
    ],
    statute: "RCW 70.170.060", collectionsProtections: true, surpriseBillingLaw: true,
  },
  WV: {
    state: "WV", name: "West Virginia",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "West Virginia has no state charity care mandate. Medicaid expansion covers adults up to 138% FPL.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "Medicaid expansion since 2014"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  WI: {
    state: "WI", name: "Wisconsin",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Wisconsin has not expanded Medicaid but covers adults up to 100% FPL through BadgerCare Plus. No state charity care mandate.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "BadgerCare Plus covers up to 100% FPL"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
  WY: {
    state: "WY", name: "Wyoming",
    hasMandatoryCharityCare: false, fplThreshold: null, reducedCareThreshold: null,
    summary: "Wyoming has no state charity care mandate and has not expanded Medicaid.",
    keyProvisions: ["Federal 501(r) applies to nonprofit hospitals", "No Medicaid expansion"],
    statute: null, collectionsProtections: false, surpriseBillingLaw: false,
  },
}