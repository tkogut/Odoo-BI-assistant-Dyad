import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
import { RpcConfirmProvider } from "@/components/rpc-confirm";
import { ThemeProvider } from "next-themes";
import Shortcuts from "@/components/Shortcuts";
import React from "react";

const queryClient = new QueryClient();

// RootLayout ensures Shortcuts (which uses useNavigate) is rendered inside router context,
// and exposes the current route outlet.
const RootLayout: React.FC = () => {
  return (
    <>
      <Shortcuts />
      <Outlet />
    </>
  );
};

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <RootLayout />,
      children: [
        { index: true, element: <Index /> },
        { path: "settings", element: <Settings /> },
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
  {
    // Opt into the v7 future flags to avoid deprecation warnings
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    } as any,
  },
);

const App = () => (
  <ThemeProvider attribute="class" enableSystem={true}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RpcConfirmProvider>
          <Toaster />
          <Sonner />
          <RouterProvider router={router} />
        </RpcConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;