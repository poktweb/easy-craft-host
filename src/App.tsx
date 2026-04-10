import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index.tsx";
import InstancesHome from "./pages/InstancesHome.tsx";
import Login from "./pages/Login.tsx";
import Register from "./pages/Register.tsx";
import AdminUsers from "./pages/AdminUsers.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-muted-foreground text-sm">Carregando...</span>
      </div>
    </div>
  );
}

function AuthenticatedRoutes() {
  const { isAdmin } = useAuth();
  return (
    <Routes>
      <Route path="/" element={<InstancesHome />} />
      <Route
        path="/admin/usuarios"
        element={isAdmin ? <AdminUsers /> : <Navigate to="/" replace />}
      />
      <Route path="/instance/:instanceId" element={<Index />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" replace />} />
        <Route path="/cadastro" element={!isAuthenticated ? <Register /> : <Navigate to="/" replace />} />
        <Route
          path="/*"
          element={isAuthenticated ? <AuthenticatedRoutes /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
