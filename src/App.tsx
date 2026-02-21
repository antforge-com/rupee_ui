import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";

// ── Page Imports ──
import AdminPage from "./pages/AdminPage";
import AdvisorDashboard from "./pages/AdvisorDashboard";
import HomePage from "./pages/HomePage"; // ✅ Added Home Page
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import UserPage from "./pages/UserPage";

// ── Service Imports ──
import { getToken } from "./services/api";

// ── Protected Route Wrapper ──
// Checks if the user is logged in. If not, redirects to /login
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  
  useEffect(() => {
    const token = getToken();
    if (!token) {
      // ✅ Redirect to /login instead of / (since / is now the landing page)
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  // Prevent flicker if no token
  if (!getToken()) return null;
  return <>{children}</>;
};

// ── Public Route Wrapper ──
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

// ── App Routes Configuration ──
function AppRoutes() {
  return (
    <Routes>
      {/* ✅ 1. Landing Page (Default Route) */}
      <Route path="/" element={<PublicRoute><HomePage /></PublicRoute>} />

      {/* ✅ 2. Auth Routes */}
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      
      {/* ✅ 3. Advisor Dashboard (Public for Demo/Access without Login flow if needed) */}
      <Route path="/advisor" element={<PublicRoute><AdvisorDashboard /></PublicRoute>} />
      
      {/* ✅ 4. Protected User Routes (Requires Login) */}
      <Route path="/user" element={<ProtectedRoute><UserPage /></ProtectedRoute>} />
      
      {/* ✅ 5. Protected Admin Routes (Requires Login) */}
      <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
      
      {/* Fallback Route: Redirect unknown URLs to Home */}
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}

// ── Root App Component ──
export default function App() {
  return (
    // Note: 'basename' removed to match your localhost screenshots (e.g. localhost:5173/user)
    // If you deploy to a subdirectory like /finadvise, add basename="/finadvise" here.
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}