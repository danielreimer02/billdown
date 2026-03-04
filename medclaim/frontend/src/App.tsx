import { BrowserRouter, Routes, Route } from "react-router-dom"
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<CharityCare />} />
          <Route path="/lcd" element={<LCDLookup />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/cases/new" element={<Cases />} />
          <Route path="/cases/:id" element={<Cases />} />
          <Route path="/cases/:id/codes" element={<CaseCodesEditor />} />
          <Route path="/cases/:id/analysis" element={<CaseAnalysis />} />
          <Route path="/tools" element={<InternalTools />} />
          <Route path="/bill-analysis" element={<BillAnalysis />} />
          <Route path="/lcd-explorer" element={<LCDExplorer />} />
          <Route path="/documents" element={<DocumentsGuide />} />
          <Route path="/start" element={<GettingStarted />} />
          <Route path="/next" element={<WhatsNext />} />
          <Route path="/physicians" element={<ForPhysicians />} />
          <Route path="/companies" element={<ForCompanies />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}