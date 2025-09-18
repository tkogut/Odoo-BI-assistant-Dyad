import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
import { RpcConfirmProvider } from "@/components/rpc-confirm";
import { ThemeProvider } from "next-themes";
import Shortcuts from "@/components/Shortcuts";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" enableSystem={true}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RpcConfirmProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Shortcuts />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/settings" element={<Settings />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </RpcConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;