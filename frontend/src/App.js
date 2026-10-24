import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "sonner";

import Landing from "@/pages/Landing";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import ChatbotPage from "@/pages/ChatbotPage";
import DocAnalyzerPage from "@/pages/DocAnalyzerPage";
import PetitionPage from "@/pages/PetitionPage";
import ContractPage from "@/pages/ContractPage";
import ResearchPage from "@/pages/ResearchPage";
import FraudPage from "@/pages/FraudPage";
import ModulePlaceholder from "@/pages/ModulePlaceholder";
import SmartModule from "@/pages/SmartModule";
import CNRTrackerPage from "@/pages/CNRTrackerPage";
import LawyerMarketplacePage from "@/pages/LawyerMarketplacePage";
import BulkContractPage from "@/pages/BulkContractPage";
import TemplatesLibraryPage from "@/pages/TemplatesLibraryPage";
import VoiceAssistantPage from "@/pages/VoiceAssistantPage";
import SharedTemplateView from "@/pages/SharedTemplateView";
import AppShell from "@/pages/AppShell";
import "@/App.css";

function Private({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/auth" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/share/:id" element={<SharedTemplateView />} />
          <Route
            path="/app"
            element={
              <Private>
                <AppShell />
              </Private>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="chatbot" element={<ChatbotPage />} />
            <Route path="document-analyzer" element={<DocAnalyzerPage />} />
            <Route path="petition-draft" element={<PetitionPage />} />
            <Route path="contract-review" element={<ContractPage />} />
            <Route path="contract-agent" element={<ContractPage />} />
            <Route path="research" element={<ResearchPage />} />
            <Route path="research-assistant" element={<ResearchPage />} />
            <Route path="cnr" element={<CNRTrackerPage />} />
            <Route path="marketplace" element={<LawyerMarketplacePage />} />
            <Route path="bulk-contracts" element={<BulkContractPage />} />
            <Route path="templates" element={<TemplatesLibraryPage />} />
            <Route path="voice" element={<VoiceAssistantPage />} />
            <Route path="fraud/:slug" element={<FraudPage />} />
            <Route path="module/:slug" element={<SmartModule />} />
            <Route path="soon/:slug" element={<ModulePlaceholder />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
