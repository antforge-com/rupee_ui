import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";

// ── Page Imports ──
import AdminPage from "./pages/AdminPage";
import AdvisorDashboard from "./pages/AdvisorDashboard";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import UserPage from "./pages/UserPage";

// ── Service Imports ──
import { getRole, getToken } from "./services/api";

// ── Role helpers ──────────────────────────────────────────────────────────────
// Normalizes any role string the backend might return
const normalizeRole = (raw?: string | null) =>
  (raw || "").toUpperCase().trim().replace(/^ROLE_/, "");

const USER_ROLES  = ["USER", "SUBSCRIBER"];         // → /user
const ADMIN_ROLES = ["ADMIN"];                       // → /admin
const ADVISOR_ROLES = ["CONSULTANT", "ADVISOR"];     // → /advisor

// ── ProtectedRoute ────────────────────────────────────────────────────────────
// allowedRoles: if provided, also checks the stored role matches
const ProtectedRoute = ({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
}) => {
  const navigate  = useNavigate();
  const token     = getToken();
  const role      = normalizeRole(getRole());

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    if (allowedRoles && !allowedRoles.includes(role)) {
      // Logged in but wrong role — redirect to their correct dashboard
      if (USER_ROLES.includes(role))    { navigate("/user",    { replace: true }); return; }
      if (ADMIN_ROLES.includes(role))   { navigate("/admin",   { replace: true }); return; }
      if (ADVISOR_ROLES.includes(role)) { navigate("/consultant", { replace: true }); return; }
      navigate("/login", { replace: true });
    }
  }, [navigate, token, role]);

  if (!token) return null;
  if (allowedRoles && !allowedRoles.includes(role)) return null;
  return <>{children}</>;
};

// ── App Routes ────────────────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <Routes>
      {/* 1. Landing Page */}
      <Route path="/" element={<HomePage />} />

      {/* 2. Auth */}
      <Route path="/login"    element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* 3. User Dashboard — USER + SUBSCRIBER roles */}
      <Route
        path="/user"
        element={
          <ProtectedRoute allowedRoles={[...USER_ROLES]}>
            <UserPage />
          </ProtectedRoute>
        }
      />

      {/* 4. Admin Dashboard — ADMIN role only */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={[...ADMIN_ROLES]}>
            <AdminPage />
          </ProtectedRoute>
        }
      />

      {/* 5. Advisor Dashboard — CONSULTANT + ADVISOR roles */}
      <Route
        path="/consultant"
        element={
          <ProtectedRoute allowedRoles={[...ADVISOR_ROLES]}>
            <AdvisorDashboard />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}