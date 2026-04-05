import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DealsProvider } from "@/context/DealsContext";
import { SyncAnalyzeProvider } from "@/context/SyncAnalyzeContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import LoginPage from "./pages/LoginPage";
import DealsListPage from "./pages/DealsListPage";
import NewDealsPage from "./pages/NewDealsPage";
import DealDetailPage from "./pages/DealDetailPage";
import PipelinePage from "./pages/PipelinePage";
import NotRelevantPage from "./pages/NotRelevantPage";
import ClosedDealsPage from "./pages/ClosedDealsPage";
import AnalyzePage from "./pages/AnalyzePage";
import AddressSearchPage from "./pages/AddressSearchPage";
import MarketSearchPage from "./pages/MarketSearchPage";
import EmailSearchPage from "./pages/EmailSearchPage";
import MarketSearchResultsPage from "./pages/MarketSearchResultsPage";
import SettingsPage from "./pages/SettingsPage";
import GmailHistoryPage from "./pages/GmailHistoryPage";
import InvestorsPage from "./pages/InvestorsPage";
import InvestorDealViewPage from "./pages/InvestorDealViewPage";
import HotDealsPage from "./pages/HotDealsPage";
import ClaudePicksPage from "./pages/ClaudePicksPage";
import ScoutPage from "./pages/ScoutPage";
import ScoutAiDealsPage from "./pages/ScoutAiDealsPage";
import ScoutFavoritesPage from "./pages/ScoutFavoritesPage";
import ScoutNotRelevantPage from "./pages/ScoutNotRelevantPage";
import DealScannerPage from "./pages/DealScannerPage";
import DealScannerQueuePage from "./pages/DealScannerQueuePage";
import { ScoutLayout } from "./layouts/ScoutLayout";
import SyncProgressPage from "./pages/SyncProgressPage";
import ApiDealsPage from "./pages/ApiDealsPage";
import AgentDealsPage from "./pages/AgentDealsPage";
import AgentManagementPage from "./pages/AgentManagementPage";
import ApiDocumentationPage from "./pages/ApiDocumentationPage";
import ApiActivityPage from "./pages/ApiActivityPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SettingsProvider>
        <TooltipProvider>
          <BrowserRouter>
            <DealsProvider>
              <SyncAnalyzeProvider>
                <Toaster />
                <Sonner />
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/" element={<ProtectedRoute><AppLayout><Index /></AppLayout></ProtectedRoute>} />
                  <Route path="/hot-deals" element={<ProtectedRoute><AppLayout><HotDealsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/hot-deals/claude-picks" element={<ProtectedRoute><AppLayout><ClaudePicksPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/sync-progress" element={<ProtectedRoute><AppLayout><SyncProgressPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/analyze" element={<ProtectedRoute><AppLayout><AnalyzePage /></AppLayout></ProtectedRoute>} />
                  <Route path="/analyze/address" element={<ProtectedRoute><AppLayout><AddressSearchPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/analyze/market" element={<ProtectedRoute><AppLayout><MarketSearchPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/analyze/email" element={<ProtectedRoute><AppLayout><EmailSearchPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/market-search-results" element={<ProtectedRoute><AppLayout><MarketSearchResultsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/new-deals" element={<ProtectedRoute><AppLayout><NewDealsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/deals" element={<ProtectedRoute><AppLayout><DealsListPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/deals/:id" element={<ProtectedRoute><AppLayout><DealDetailPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/pipeline" element={<ProtectedRoute><AppLayout><PipelinePage /></AppLayout></ProtectedRoute>} />
                  <Route path="/not-relevant" element={<ProtectedRoute><AppLayout><NotRelevantPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/closed" element={<ProtectedRoute><AppLayout><ClosedDealsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/gmail-history" element={<ProtectedRoute><AppLayout><GmailHistoryPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/investors" element={<ProtectedRoute><AppLayout><InvestorsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/investor/deals/:id" element={<ProtectedRoute><AppLayout><InvestorDealViewPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/scout" element={<ProtectedRoute><ScoutLayout><ScoutPage /></ScoutLayout></ProtectedRoute>} />
                  <Route path="/scout/ai-analyzed" element={<ProtectedRoute><ScoutLayout><ScoutAiDealsPage /></ScoutLayout></ProtectedRoute>} />
                  <Route path="/scout/favorites" element={<ProtectedRoute><ScoutLayout><ScoutFavoritesPage /></ScoutLayout></ProtectedRoute>} />
                  <Route path="/scout/not-relevant" element={<ProtectedRoute><ScoutLayout><ScoutNotRelevantPage /></ScoutLayout></ProtectedRoute>} />
                  <Route path="/scout/deal-scanner" element={<ProtectedRoute><ScoutLayout><DealScannerPage /></ScoutLayout></ProtectedRoute>} />
                  <Route path="/scout/deal-scanner/queue" element={<ProtectedRoute><DealScannerQueuePage /></ProtectedRoute>} />
                  <Route path="/api-deals" element={<ProtectedRoute><AppLayout><ApiDealsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/agent-deals" element={<ProtectedRoute><AppLayout><AgentDealsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/agent-management" element={<ProtectedRoute><AppLayout><AgentManagementPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/api-docs" element={<ProtectedRoute><AppLayout><ApiDocumentationPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/api-activity" element={<ProtectedRoute><AppLayout><ApiActivityPage /></AppLayout></ProtectedRoute>} />
                  <Route path="*" element={<ProtectedRoute><AppLayout><NotFound /></AppLayout></ProtectedRoute>} />
                </Routes>
              </SyncAnalyzeProvider>
            </DealsProvider>
          </BrowserRouter>
        </TooltipProvider>
      </SettingsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
