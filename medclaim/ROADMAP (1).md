# MedClaim — Roadmap

One end goal: the only platform that represents both patients AND physicians against insurance. Nobody else can build this without betraying their existing customers.

---

## Step 1 — Uninsured Bill Disputes
*First 10 paying cases. Prove the core loop works.*

- Upload hospital bill → OCR extracts CPT/ICD codes
- Flag NCCI bundling violations and MUE unit errors
- Compare charges to Medicare published rates
- Check charity care eligibility by income + state
- Generate dispute letter with legal citations
- Charge success fee on savings
- Add Good Faith estimate to protect yourself in future and in review bills and home page and getting started I think its no surprises act
- add were these cpts are appropriate given the icds ie what cpts do you get from uploaded icds 

---

## Step 2 — Insured Bill Disputes
*Expand to the other 90% of the population.*

- Parse EOB documents alongside hospital bill
- Three-way reconciliation: billed vs. allowed vs. patient owes
- Translate denial reason codes (CO-4, CO-97, etc.) into plain English
- Flag wrongful denials using LCD coverage data
- Generate appeal letters citing specific LCD numbers
- Use EOB and NPI(doctor identifier) to see if surprise out of network bill then cite No Surprises Act

---

## Step 3 — Prior Auth Appeals (Patient-Side)
*Denial arrived. Fight it.*

- Patient uploads denial letter
- Identify denial type: no prior auth, medical necessity, experimental
- Pull LCD documentation requirements for the denied procedure
- Generate patient appeal letter with medical necessity argument
- Route to external IRO appeal when internal appeal fails
- Track appeal outcomes to build denial pattern database

---

## Step 4 — Prior Auth Tool (Physician-Side, No Integration)
*Prevent the denial before it happens.*

- Physician enters CPT + ICD-10 codes
- Show LCD documentation checklist: "your notes must include these items"
- Show denial probability by insurer + state from case history
- Physician uses as a writing guide before charting
- No EHR integration yet — browser tab alongside existing workflow
- Subscription: $300–500/month per practice

---

## Step 5 — Athena EHR Integration
*Stop being a browser tab. Live inside the workflow.*

- Apply for Athena Marketplace Partner (free, 1–2 months)
- Pull diagnosis + procedure codes directly from open chart
- LCD checklist appears automatically when prior auth is initiated
- Push documentation suggestions back into Athena note field
- Show denial rate widget in sidebar
- Complete HITRUST self-assessment (required within 90 days of go-live)
- Listed on Athena Marketplace: 160k+ providers can find you

---

## Step 6 — Self-Insured Employer Contracts
*Recurring B2B revenue. Use consumer case history as proof.*

- White-labeled employee portal for submitting bills
- Employer dashboard: error rates by procedure and insurer
- Quarterly ROI report showing what was recovered
- Pricing: $2–5 per employee per month
- Target: 200–2,000 employee companies already self-insured

---

## Step 7 — Insurance Plan Selection Tool
*Annual recurring touchpoint. Own the full customer lifecycle.*

- CMS publishing insurer denial rates starting 2026 — no good UI exists yet
- Plan comparison with denial rate overlay for patient's specific procedures
- Drug formulary check, provider network verification
- Total cost estimator based on actual conditions
- Launch before November 1 open enrollment each year
- Upsell: "pick this plan with us, we're here if they deny you"

---

## Step 8 — Full Coordination Layer
*The defensible endgame. Patient + physician appealing in parallel.*

- Shared case file: physician sees patient's appeal, patient sees physician's documentation status
- Simultaneous patient appeal + physician peer-to-peer request, coordinated
- State insurance commissioner complaint filing
- Pattern detection: flag when 50+ cases match the same denial profile
- Epic integration (requires SOC 2 + 6–18 month process — tackle after Step 6 revenue)

---

## Revenue by Step

| Step | Model | Target |
|---|---|---|
| 1–2 | Consumer success fee | $30–50k year 1 |
| 3–4 | Success fee + physician SaaS | $150–300k ARR year 2 |
| 5–6 | Marketplace + employer contracts | $500k–1M ARR year 3 |
| 7–8 | Platform + data moat | $2M+ ARR year 4 |

---

## The Moat

Every resolved case adds to a denial pattern database nobody else has. Which insurers deny which codes, at what rates, and which appeal arguments win. **Never sell this data — use it to power the product.** A competitor can copy the UI. They cannot replicate 10,000 cases of denial history.

---

*March 2026*
