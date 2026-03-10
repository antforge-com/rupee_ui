import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";

// ── Page Imports ──
import AdminPage from "./pages/AdminPage";
import AdvisorDashboard from "./pages/AdvisorDashboard";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import UserPage from "./pages/UserPage";

// ── Notification System ──
import { NotificationProvider } from "./pages/NotificationSystem";

// ── Service Imports ──
import { getRole, getToken } from "./services/api";

// ── Role helpers ──────────────────────────────────────────────────────────────
const normalizeRole = (raw?: string | null) =>
  (raw || "").toUpperCase().trim().replace(/^ROLE_/, "");

const USER_ROLES = ["USER", "SUBSCRIBER"];
const ADMIN_ROLES = ["ADMIN"];
const ADVISOR_ROLES = ["CONSULTANT", "ADVISOR"];

// ── ProtectedRoute ────────────────────────────────────────────────────────────
const ProtectedRoute = ({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
}) => {
  const navigate = useNavigate();
  const token = getToken();
  const role = normalizeRole(getRole());

  useEffect(() => {
    if (!token) { navigate("/login", { replace: true }); return; }
    if (allowedRoles && !allowedRoles.includes(role)) {
      if (USER_ROLES.includes(role)) { navigate("/user", { replace: true }); return; }
      if (ADMIN_ROLES.includes(role)) { navigate("/admin", { replace: true }); return; }
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
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/user"
        element={
          <ProtectedRoute allowedRoles={[...USER_ROLES]}>
            <UserPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={[...ADMIN_ROLES]}>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/consultant"
        element={
          <ProtectedRoute allowedRoles={[...ADVISOR_ROLES]}>
            <AdvisorDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    // NotificationProvider wraps the entire app so every page can use
    // useNotifications(), UserTicketMonitor, NotificationBell, etc.
    // Note: AdminPage has its own internal NotificationProvider wrap too,
    // which is fine — the inner one takes precedence for admin-specific
    // notifications while this outer one covers UserPage and AdvisorDashboard.
    <NotificationProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </NotificationProvider>
  );
}