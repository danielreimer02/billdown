import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AuthProvider } from "@/store/auth"
import Layout from "@/components/layout/Layout"
import AdminRoute from "@/components/AdminRoute"
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
import InsuranceGlossary from "@/pages/InsuranceGlossary"
import SiteMaintenance from "@/pages/SiteMaintenance"
import ForIndividuals from "@/pages/ForIndividuals"
import Analytics from "@/pages/Analytics"
import WhatWeOffer from "@/pages/WhatWeOffer"
import AuthPage from "@/pages/AuthPage"
import GuestRolePicker from "@/pages/GuestRolePicker"
import GuestCases from "@/pages/GuestCases"
import AdminLogin from "@/pages/AdminLogin"
import AdminCases from "@/pages/AdminCases"
import MyPlans from "@/pages/MyPlans"
import InsuranceGuide from "@/pages/InsuranceGuide"
import SiteAnalytics from "@/pages/SiteAnalytics"

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
          <Route path="/bill-analysis" element={<BillAnalysis />} />
          <Route path="/lcd-explorer" element={<LCDExplorer />} />
          <Route path="/mue-explorer" element={<MUEExplorer />} />
          <Route path="/pfs-explorer" element={<PFSExplorer />} />
          <Route path="/ptp-explorer" element={<PTPExplorer />} />
          <Route path="/icd10-explorer" element={<ICD10Explorer />} />
          <Route path="/cpt-explorer" element={<CPTExplorer />} />
          <Route path="/plans/glossary" element={<InsuranceGlossary />} />
          <Route path="/insurance-plans" element={<MyPlans />} />
          <Route path="/insurance-guide" element={<InsuranceGuide />} />
          <Route path="/what-we-offer" element={<WhatWeOffer />} />
          <Route path="/documents" element={<DocumentsGuide />} />
          <Route path="/start" element={<GettingStarted />} />
          <Route path="/next" element={<WhatsNext />} />
          <Route path="/individuals" element={<ForIndividuals />} />
          <Route path="/physicians" element={<ForPhysicians />} />
          <Route path="/companies" element={<ForCompanies />} />
          <Route path="/guest" element={<GuestRolePicker />} />
          <Route path="/guest/individual" element={<GuestCases />} />
          <Route path="/guest/individual/new" element={<GuestCases />} />
          <Route path="/guest/individual/:id" element={<GuestCases />} />

          {/* ── Admin routes (require admin login) ── */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/cases" element={<AdminRoute><AdminCases /></AdminRoute>} />
          <Route path="/admin/tools" element={<AdminRoute><InternalTools /></AdminRoute>} />
          <Route path="/admin/data-analytics" element={<AdminRoute><Analytics /></AdminRoute>} />
          <Route path="/admin/site-analytics" element={<AdminRoute><SiteAnalytics /></AdminRoute>} />
          <Route path="/admin/site-maintenance" element={<AdminRoute><SiteMaintenance /></AdminRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  )
}