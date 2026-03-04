import { BrowserRouter, Routes, Route } from "react-router-dom"
import Layout from "@/components/layout/Layout"
import CharityCare from "@/pages/CharityCare"
import LCDLookup from "@/pages/LCDLookup"
import Cases from "@/pages/Cases"
import BillAnalysis from "@/pages/BillAnalysis"
import DocumentsGuide from "@/pages/DocumentsGuide"
import GettingStarted from "@/pages/GettingStarted"
import WhatsNext from "@/pages/WhatsNext"
import ForPhysicians from "@/pages/ForPhysicians"

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
          <Route path="/bill-analysis" element={<BillAnalysis />} />
          <Route path="/documents" element={<DocumentsGuide />} />
          <Route path="/start" element={<GettingStarted />} />
          <Route path="/next" element={<WhatsNext />} />
          <Route path="/physicians" element={<ForPhysicians />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}