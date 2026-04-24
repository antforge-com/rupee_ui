import { CheckCircle, Plus, XCircle } from "lucide-react";
import React, { useEffect, useState } from "react";
import { MeetTheMastersLoader } from "../components/MeetTheMastersLoader.tsx";
import { API_BASE_URL } from "../config/api.ts";
import { formatIndianCurrency, formatNameLikeInput, startsWithNumber } from "../utils/formUtils";

// --- API Helpers ---
const BASE = API_BASE_URL;

const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("admin_token") || localStorage.getItem("fin_token");
  const res = await fetch(`${BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const ct = res.headers.get("content-type");
  const data = ct?.includes("application/json")
    ? await res.json()
    : { message: await res.text() };
  if (!res.ok) {
    const fieldErrors = data?.fieldErrors
      ? Object.entries(data.fieldErrors)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
      : null;
    throw new Error(fieldErrors || data?.message || `Error ${res.status}`);
  }
  return data;
};

// --- Types ---
interface Plan {
  id: number;
  name: string;
  originalPrice: number;
  discountPrice: number;
  features: string;
  tag: string;
}

export const SubscriptionPlansPanel: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    originalPrice: 0,
    discountPrice: 0,
    features: "",
    tag: "",
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const extractPlans = (data: any): Plan[] => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.content)) return data.content;
    for (const key of ["plans", "subscriptionPlans", "data", "items", "results", "list"]) {
      if (Array.isArray(data[key])) return data[key];
    }
    return [];
  };

  const fetchPlans = async () => {
    setLoading(true);
    setError("");
    try {
      let data: any;
      try {
        data = await apiFetch("/subscription-plans/all");
      } catch (e) {
        data = await apiFetch("/subscription-plans");
      }
      setPlans(extractPlans(data));
    } catch (err: any) {
      setError(err?.message || "Failed to load plans.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleOpenModal = (plan?: Plan) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        name: plan.name || "",
        originalPrice: plan.originalPrice || 0,
        discountPrice: plan.discountPrice || 0,
        features: plan.features || "",
        tag: plan.tag || "",
      });
    } else {
      setEditingPlan(null);
      setFormData({ name: "", originalPrice: 0, discountPrice: 0, features: "", tag: "" });
    }
    setFormError("");
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPlan(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedName = formData.name.trim();
    if (!cleanedName) {
      setFormError("Plan name is required");
      return;
    }
    if (startsWithNumber(cleanedName)) {
      setFormError("Plan name cannot start with a number");
      return;
    }
    setFormSubmitting(true);
    setFormError("");

    const payload = {
      ...formData,
      name: cleanedName,
      features: formData.features.trim(),
      tag: formData.tag.trim(),
    };

    try {
      if (editingPlan) {
        // Edit existing plan
        await apiFetch(`/subscription-plans/${editingPlan.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        // Create new plan
        await apiFetch("/subscription-plans", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setIsModalOpen(false);
      fetchPlans();
    } catch (err: any) {
      setFormError(err?.message || "Failed to save plan.");
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBlockEnd: 28 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>
            Subscription Plans
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748B" }}>
            Manage subscription plans available to users.
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          style={{
            background: "#0F766E",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Plus size={16} /> Add New Plan
        </button>
      </div>



      {loading ? (
        <MeetTheMastersLoader message="Loading plans..." padding="40px" />
      ) : error ? (
        <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "16px", borderRadius: 8 }}>
          {error}
        </div>
      ) : plans.length === 0 ? (
        <div
          style={{
            background: "#F8FAFC",
            border: "1px dashed #CBD5E1",
            borderRadius: 16,
            padding: "60px 20px",
            textAlign: "center",
            color: "#94A3B8",
          }}
        >
          <div style={{ fontWeight: 600, color: "#64748B", marginBlockEnd: 8 }}>
            No subscription plans found
          </div>
          <p style={{ fontSize: 13, margin: 0 }}>Click "Add New Plan" to create one.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
          {plans.map((plan) => (
            <div
              key={plan.id}
              style={{
                background: "#fff",
                border: "1px solid #E2E8F0",
                borderRadius: 12,
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBlockEnd: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0F172A", display: "flex", alignItems: "center", gap: 8 }}>
                    {plan.name}
                    {plan.tag && (
                      <span style={{ fontSize: 10, background: "#DCFCE7", color: "#166534", padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>
                        {plan.tag}
                      </span>
                    )}
                  </h3>
                </div>
                <button
                  onClick={() => handleOpenModal(plan)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 12, fontWeight: 700, color: "#0F766E",
                    background: "#ECFEFF", border: "1.5px solid #A5F3FC",
                    borderRadius: 8, padding: "5px 12px", cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#CFFAFE")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#ECFEFF")}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBlockEnd: 16 }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: "#0F766E" }}>
                  {formatIndianCurrency(plan.discountPrice)}
                </span>
                {plan.originalPrice > plan.discountPrice && (
                  <span style={{ fontSize: 14, color: "#94A3B8", textDecoration: "line-through" }}>
                    {formatIndianCurrency(plan.originalPrice)}
                  </span>
                )}
              </div>

              {plan.features && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBlockEnd: 8, textTransform: "uppercase" }}>Features</div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                    {plan.features.split("+").map((f, i) => {
                      const feature = f.trim();
                      if (!feature) return null;
                      return (
                        <li key={i} style={{ fontSize: 13, color: "#334155", display: "flex", alignItems: "flex-start", gap: 6 }}>
                          <CheckCircle size={14} color="#10B981" style={{ flexShrink: 0, marginBlockStart: 2 }} />
                          {feature}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              inlineSize: "min(500px, 95vw)",
              overflow: "hidden",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            }}
          >
            <div style={{ padding: "20px 24px", borderBlockEnd: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                {editingPlan ? "Edit Plan" : "Add New Plan"}
              </h3>
              <button onClick={handleCloseModal} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B" }}>
                <XCircle size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: "24px" }}>
              {formError && (
                <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "12px", borderRadius: 8, marginBlockEnd: 16, fontSize: 13 }}>
                  {formError}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBlockEnd: 6 }}>Plan Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: formatNameLikeInput(e.target.value) });
                      setFormError("");
                    }}
                    style={{ inlineSize: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                    placeholder="e.g. Elite"
                    required
                  />
                </div>

                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBlockEnd: 6 }}>Original Price (₹) *</label>
                    <input
                      type="number"
                      value={formData.originalPrice}
                      onChange={(e) => setFormData({ ...formData, originalPrice: Number(e.target.value) })}
                      style={{ inlineSize: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                      min="0"
                      required
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBlockEnd: 6 }}>Discount Price (₹) *</label>
                    <input
                      type="number"
                      value={formData.discountPrice}
                      onChange={(e) => setFormData({ ...formData, discountPrice: Number(e.target.value) })}
                      style={{ inlineSize: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                      min="0"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBlockEnd: 6 }}>Tag (Optional)</label>
                  <input
                    type="text"
                    value={formData.tag}
                    onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
                    style={{ inlineSize: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                    placeholder="e.g. PREMIUM"
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBlockEnd: 6 }}>Features</label>
                  <p style={{ margin: "0 0 8px", fontSize: 11, color: "#94A3B8" }}>Separate features with a plus sign (+). E.g: Tax Optimization + Pro + Live Support</p>
                  <textarea
                    value={formData.features}
                    onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                    style={{ inlineSize: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 14, outline: "none", minBlockSize: 80, resize: "vertical", boxSizing: "border-box" }}
                    placeholder="Feature 1 + Feature 2"
                  />
                </div>
              </div>

              <div style={{ marginBlockStart: 24, display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  style={{ padding: "10px 16px", background: "#F1F5F9", color: "#475569", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  style={{ padding: "10px 20px", background: "#0F766E", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: formSubmitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8 }}
                >
                  {formSubmitting && (
                    <div style={{ inlineSize: 14, blockSize: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  )}
                  {editingPlan ? "Save Changes" : "Create Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};
