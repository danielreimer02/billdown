import { BrowserRouter, Routes, Route } from "react-router-dom"
import Layout from "@/components/layout/Layout"
import CharityCare from "@/pages/CharityCare"
import LCDLookup from "@/pages/LCDLookup"
import Cases from "@/pages/Cases"
import CaseDetail from "@/pages/CaseDetail"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<CharityCare />} />
          <Route path="/lcd" element={<LCDLookup />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}