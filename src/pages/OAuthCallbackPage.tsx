/**
 * OAuthCallbackPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles the redirect from Spring Security's Google OAuth2 flow.
 *
 * After the user approves Google consent, the backend redirects to:
 *   http://localhost:5173/rupee_ui/oauth2/callback
 *     ?token=<JWT>
 *     &role=<ROLE>
 *     &userId=<id>
 *     [&consultantId=<id>]
 *     [&name=<displayName>]
 *     [&email=<email>]
 *
 * This page:
 *   1. Reads all query params
 *   2. Stores them in localStorage via api.ts helpers
 *   3. Redirects to the correct dashboard based on role
 *   4. Shows animated feedback during processing
 *
 * Required App.tsx route (add alongside your existing routes):
 *   <Route path="/oauth2/callback" element={<OAuthCallbackPage />} />
 *
 * Backend application.yml snippet:
 *   app:
 *     oauth2:
 *       authorized-redirect-uri: http://localhost:5173/rupee_ui/oauth2/callback
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearToken,
  debugToken,
  setConsultantId,
  setRole,
  setToken,
  setUserId,
} from "../services/api";

// ─────────────────────────────────────────────────────────────────────────────
// ROLE → ROUTE MAP
// ─────────────────────────────────────────────────────────────────────────────
const roleToRoute = (role: string): string => {
  const r = role.toUpperCase().replace(/^ROLE_/, "").trim();
  if (["ADMIN"].includes(r)) return "/admin";
  if (["CONSULTANT", "ADVISOR"].includes(r)) return "/consultant";
  // USER, SUBSCRIBER, and any unknown role → user dashboard
  return "/user";
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
type PageState = "processing" | "success" | "error";

const OAuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>("processing");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");

  // Guard against React StrictMode double-mount
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const params = new URLSearchParams(window.location.search);

    const token        = params.get("token");
    const role         = params.get("role");
    const userId       = params.get("userId");
    const consultantId = params.get("consultantId");
    const name         = params.get("name");
    const email        = params.get("email");
    const errorParam   = params.get("error");

    // ── Handle backend-reported errors ──────────────────────────────────────
    if (errorParam) {
      setState("error");
      setErrorMsg(
        errorParam === "access_denied"
          ? "Access was denied. Please try again and allow the required permissions."
          : errorParam === "email_not_found"
          ? "Could not retrieve your email address from Google. Please use email/password login."
          : `Authentication error: ${errorParam}`
      );
      return;
    }

    // ── Validate required params ─────────────────────────────────────────────
    if (!token || !role || !userId) {
      setState("error");
      setErrorMsg(
        "Missing authentication data in the callback URL. " +
        "Please contact support or try logging in again."
      );
      console.error("[OAuthCallback] Missing params:", { token: !!token, role: !!role, userId: !!userId });
      return;
    }

    // ── Persist to localStorage ──────────────────────────────────────────────
    try {
      clearToken(); // wipe any stale session first
      setToken(token);
      setRole(role);
      setUserId(Number(userId));
      if (consultantId) setConsultantId(Number(consultantId));
      if (name)  localStorage.setItem("fin_user_name", name);
      if (email) localStorage.setItem("fin_user_email", email);

      // Debug output (shows decoded JWT in console)
      debugToken();

      setUserName(name || email || `User #${userId}`);
      setUserRole(role.replace(/^ROLE_/, "").toUpperCase());

      setState("success");

      // Redirect after a short delay so user can see the success animation
      const destination = roleToRoute(role);
      setTimeout(() => navigate(destination, { replace: true }), 1600);

    } catch (err: any) {
      setState("error");
      setErrorMsg(err?.message || "An unexpected error occurred while saving your session.");
      console.error("[OAuthCallback] Error persisting session:", err);
    }
  }, [navigate]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #F0F4FF 0%, #E8F0FE 50%, #F5F0FF 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      padding: "20px",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 24,
        padding: "48px 40px",
        width: "100%",
        maxWidth: 440,
        boxShadow: "0 24px 80px rgba(37, 99, 235, 0.12)",
        textAlign: "center",
        animation: "popIn 0.3s ease",
      }}>

        {/* FINADVISE Logo */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 32,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: "linear-gradient(135deg, #1E3A5F, #2563EB)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 900, color: "#fff",
            boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
          }}>
            F
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1E3A5F", letterSpacing: "-0.01em" }}>
              FINADVISE
            </div>
            <div style={{ fontSize: 10, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Smart Finance Platform
            </div>
          </div>
        </div>

        {/* ── PROCESSING ── */}
        {state === "processing" && (
          <>
            {/* Animated spinner */}
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "linear-gradient(135deg, #EFF6FF, #DBEAFE)",
              border: "3px solid #93C5FD",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 24px",
              animation: "pulse 1.5s ease-in-out infinite",
            }}>
              <div style={{
                width: 36, height: 36,
                border: "3px solid #E2E8F0",
                borderTopColor: "#2563EB",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }} />
            </div>

            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#0F172A" }}>
              Signing you in…
            </h2>
            <p style={{ margin: "0 0 24px", fontSize: 14, color: "#64748B", lineHeight: 1.6 }}>
              Verifying your Google account and setting up your session. This only takes a moment.
            </p>

            {/* Step indicators */}
            {[
              "Verifying Google token",
              "Loading your profile",
              "Preparing your dashboard",
            ].map((step, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 14px", borderRadius: 10,
                background: "#F8FAFC",
                marginBottom: 8,
                textAlign: "left",
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#2563EB",
                  animation: `pulse 1.5s ease-in-out ${i * 0.3}s infinite`,
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>{step}</span>
              </div>
            ))}
          </>
        )}

        {/* ── SUCCESS ── */}
        {state === "success" && (
          <>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "linear-gradient(135deg, #F0FDF4, #DCFCE7)",
              border: "3px solid #86EFAC",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 24px",
              animation: "popIn 0.3s ease",
            }}>
              <span style={{ fontSize: 32 }}>✅</span>
            </div>

            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#0F172A" }}>
              Welcome{userName ? `, ${userName.split(" ")[0]}` : " back"}!
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748B", lineHeight: 1.6 }}>
              You've been successfully authenticated via Google.
              {userRole && (
                <> Logged in as <strong style={{ color: "#2563EB" }}>{userRole}</strong>.</>
              )}
            </p>

            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#F0FDF4", border: "1px solid #86EFAC",
              borderRadius: 10, padding: "10px 18px",
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", background: "#22C55E",
                animation: "pulse 1s ease-in-out infinite",
              }} />
              <span style={{ fontSize: 13, color: "#16A34A", fontWeight: 600 }}>
                Redirecting to your dashboard…
              </span>
            </div>
          </>
        )}

        {/* ── ERROR ── */}
        {state === "error" && (
          <>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "linear-gradient(135deg, #FEF2F2, #FEE2E2)",
              border: "3px solid #FCA5A5",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 24px",
            }}>
              <span style={{ fontSize: 32 }}>⚠️</span>
            </div>

            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#0F172A" }}>
              Authentication Failed
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748B", lineHeight: 1.6 }}>
              {errorMsg || "Something went wrong during sign-in. Please try again."}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => navigate("/login", { replace: true })}
                style={{
                  width: "100%", padding: "13px",
                  background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
                  border: "none", borderRadius: 12, color: "#fff",
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
                }}
              >
                ← Back to Login
              </button>
              <button
                onClick={() => {
                  // Re-trigger Google OAuth by hitting the backend endpoint
                  window.location.href = "/api/oauth2/authorize/google";
                }}
                style={{
                  width: "100%", padding: "13px",
                  background: "#fff",
                  border: "1.5px solid #E2E8F0", borderRadius: 12,
                  color: "#374151", fontSize: 14, fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 10,
                }}
              >
                {/* Google logo SVG */}
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18L12.048 13.56C11.244 14.1 10.211 14.42 9 14.42c-3.317 0-6.127-2.24-7.131-5.248H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                  <path d="M1.869 9.172c-.254-.76-.399-1.57-.399-2.4 0-.83.145-1.64.399-2.4V2.04H.957C.347 3.268 0 4.62 0 6.772c0 1.127.225 2.204.628 3.19l1.241-.79z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.485 7.29C4.489 4.28 7.299 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Try Again with Google
              </button>
            </div>

            {/* Debug info for developers */}
            <details style={{ marginTop: 16, textAlign: "left" }}>
              <summary style={{ fontSize: 11, color: "#94A3B8", cursor: "pointer", userSelect: "none" }}>
                Developer info
              </summary>
              <div style={{
                marginTop: 8, padding: "10px 12px",
                background: "#F8FAFC", border: "1px solid #E2E8F0",
                borderRadius: 8, fontSize: 11, color: "#64748B",
                fontFamily: "monospace", wordBreak: "break-all",
              }}>
                <div><strong>URL params:</strong> {window.location.search || "(none)"}</div>
                <div style={{ marginTop: 4 }}>
                  <strong>Expected:</strong> ?token=JWT&amp;role=ROLE&amp;userId=ID
                </div>
                <div style={{ marginTop: 4 }}>
                  <strong>Backend redirect URI must be:</strong><br />
                  {window.location.origin + window.location.pathname}
                </div>
              </div>
            </details>
          </>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 32, paddingTop: 20,
          borderTop: "1px solid #F1F5F9",
          fontSize: 11, color: "#94A3B8",
        }}>
          Secured by Google OAuth 2.0 · FINADVISE © {new Date().getFullYear()}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes popIn {
          from { transform: scale(0.9) translateY(12px); opacity: 0; }
          to   { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(0.95); }
        }
      `}</style>
    </div>
  );
};

export default OAuthCallbackPage;