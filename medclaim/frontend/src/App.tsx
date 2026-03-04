import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AuthProvider } from "@/store/auth"
import Layout from "@/components/layout/Layout"
import CharityCare from "@/pages/CharityCare"
import LCDLookup from "@/pages/LCDLookup"
import Cases from "@/pages/Cases"
import CaseCodesEditor from "@/pages/CaseCodesEditor"
import CaseAnalysis from "@/pages/CaseAnalysis"
import BillAnalysis from "@/pages/BillAnalysis"
import InternalTools from "@/pages/InternalTools"
import DocumentsGuide from "@/pages/DocumentsGuide"
import GettingStarted from "@/pages/GettingStarted"
import WhatsNext from "@/pages/WhatsNext"
import ForPhysicians from "@/pages/ForPhysicians"
import ForCompanies from "@/pages/ForCompanies"
import LCDExplorer from "@/pages/LCDExplorer"
import MUEExplorer from "@/pages/MUEExplorer"
import PFSExplorer from "@/pages/PFSExplorer"
import PTPExplorer from "@/pages/PTPExplorer"
import ICD10Explorer from "@/pages/ICD10Explorer"
import CPTExplorer from "@/pages/CPTExplorer"
import PlanComparison from "@/pages/PlanComparison"
import InsuranceGlossary from "@/pages/InsuranceGlossary"
import SiteMaintenance from "@/pages/SiteMaintenance"
import ForIndividuals from "@/pages/ForIndividuals"
import Analytics from "@/pages/Analytics"
import WhatWeOffer from "@/pages/WhatWeOffer"
import AuthPage from "@/pages/AuthPage"
import GuestRolePicker from "@/pages/GuestRolePicker"
import GuestCases from "@/pages/GuestCases"

export default function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<CharityCare />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/lcd" element={<LCDLookup />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/cases/new" element={<Cases />} />
          <Route path="/cases/:id" element={<Cases />} />
          <Route path="/cases/:id/codes" element={<CaseCodesEditor />} />
          <Route path="/cases/:id/analysis" element={<CaseAnalysis />} />
          <Route path="/tools" element={<InternalTools />} />
          <Route path="/bill-analysis" element={<BillAnalysis />} />
          <Route path="/lcd-explorer" element={<LCDExplorer />} />
          <Route path="/mue-explorer" element={<MUEExplorer />} />
          <Route path="/pfs-explorer" element={<PFSExplorer />} />
          <Route path="/ptp-explorer" element={<PTPExplorer />} />
          <Route path="/icd10-explorer" element={<ICD10Explorer />} />
          <Route path="/cpt-explorer" element={<CPTExplorer />} />
          <Route path="/plans" element={<PlanComparison />} />
          <Route path="/plans/glossary" element={<InsuranceGlossary />} />
          <Route path="/site-maintenance" element={<SiteMaintenance />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/what-we-offer" element={<WhatWeOffer />} />
          <Route path="/documents" element={<DocumentsGuide />} />
          <Route path="/start" element={<GettingStarted />} />
          <Route path="/next" element={<WhatsNext />} />
          <Route path="/individuals" element={<ForIndividuals />} />
          <Route path="/physicians" element={<ForPhysicians />} />
          <Route path="/companies" element={<ForCompanies />} />
          <Route path="/guest" element={<GuestRolePicker />} />
          <Route path="/guest/individual" element={<GuestCases />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  )
}