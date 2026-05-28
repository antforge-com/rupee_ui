import React, { useState, useEffect, useRef } from "react";
import { User, MapPin, Phone, Mail, Clock, Shield, Lock, Settings, Edit2, Camera, CheckCircle, AlertTriangle } from "lucide-react";
import { API_BASE_URL, buildBackendAssetUrl } from "../config/api";
import { apiFetch, getRole, getUserId } from "../services/api";
import { MeetTheMastersLoader } from "./MeetTheMastersLoader";

interface IncomeItem { incomeType: string; incomeAmount: number }
interface ExpenseItem { expenseType: string; expenseAmount: number }

interface SubscriptionPlanDetail {
  id: number;
  name: string;
  originalPrice: number;
  discountPrice: number;
  features?: string;
  tag?: string;
  validityInMonths?: number;
}

interface UserProfile {
  id?: number;
  name?: string;
  email?: string;
  location?: string;
  memberSince?: string;
  identifier?: string;
  role?: string;
  subscribed?: boolean;
  subscriptionPlanName?: string;
  subscriptionPlanId?: number;
  phone?: string;
  designation?: string;
  organizationName?: string;
  createdAt?: string;
  incomes?: IncomeItem[];
  expenses?: ExpenseItem[];
}

const resolvePhotoUrl = (path?: string | null): string => {
  if (!path) return "";
  return buildBackendAssetUrl(path);
};

interface AccountProfileProps {
  onBack: () => void;
}

export const AccountProfile: React.FC<AccountProfileProps> = ({ onBack }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    location: "",
    phone: "",
    designation: "",
    organizationName: ""
  });

  // ── Subscription plans state ──
  const [plans, setPlans] = useState<SubscriptionPlanDetail[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        let raw: any = null;
        try { raw = await apiFetch(`/users/me`); } catch {
          const sid = getUserId();
          if (sid) try { raw = await apiFetch(`/users/${sid}`); } catch { }
        }
        if (!raw) { raw = { id: getUserId(), role: getRole() }; }
        if (!raw) { setProfile(null); setLoading(false); return; }

        const userId = raw.id || raw.userId;
        let onboard: any = null;
        if (userId) { try { onboard = await apiFetch(`/onboarding/${userId}`); } catch { } }

        const merged = { ...raw, ...(onboard || {}) };
        const normalized: UserProfile = {
          id: merged.id || merged.userId,
          name: merged.name || merged.fullName || "",
          email: merged.email || merged.emailId || "",
          location: merged.location || merged.city || "",
          identifier: merged.identifier || merged.username || merged.email || "",
          role: merged.role || merged.userRole || "",
          subscribed: merged.subscribed ?? merged.isSubscribed ?? false,
          subscriptionPlanName: merged.subscriptionPlanName || merged.planName || merged.subscriptionPlan?.name || "",
          subscriptionPlanId: merged.subscriptionPlanId || merged.subscriptionPlan?.id || null,
          phone: merged.phone || merged.phoneNumber || merged.mobile || "",
          designation: merged.designation || "",
          organizationName: merged.organizationName || merged.organization_name || "",
          createdAt: merged.createdAt || merged.registeredAt || "",
          incomes: (merged.incomes || merged.incomeItems || []).map((i: any) => ({
            incomeType: i.incomeType || i.label || "Income",
            incomeAmount: i.incomeAmount ?? i.amount ?? 0
          })),
          expenses: (merged.expenses || merged.expenseItems || []).map((e: any) => ({
            expenseType: e.expenseType || e.label || "Expense",
            expenseAmount: e.expenseAmount ?? e.amount ?? 0
          })),
          memberSince: merged.memberSince || merged.member_since || merged.createdAt || "",
        };
        const existingPhoto = merged.profileImageUrl || merged.profilePhoto || merged.photo || merged.avatarUrl || "";
        if (existingPhoto) setAvatarPreview(resolvePhotoUrl(existingPhoto));
        setProfile(normalized);
        setSelectedPlanId(normalized.subscriptionPlanId ?? null);
        setForm({
          name: normalized.name || "",
          email: normalized.email || "",
          location: normalized.location || "",
          phone: normalized.phone || "",
          designation: normalized.designation || "",
          organizationName: normalized.organizationName || ""
        });
      } catch { setProfile(null); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setPlansLoading(true);
      try {
        for (const ep of ["/subscription-plans", "/subscriptions/plans", "/plans"]) {
          try {
            const data = await apiFetch(ep);
            const arr: any[] = Array.isArray(data) ? data : (data?.content || data?.plans || []);
            if (arr.length > 0) {
              setPlans(arr.map((p: any) => ({
                id: p.id,
                name: p.name || p.planName || "",
                originalPrice: Number(p.originalPrice ?? p.price ?? p.discountPrice ?? 0),
                discountPrice: Number(p.discountPrice ?? p.price ?? p.originalPrice ?? 0),
                features: p.features || "",
                tag: p.tag || "",
                validityInMonths: Math.max(0, Number(p.validityInMonths ?? p.validity_in_months ?? 1) || 0),
              })));
              break;
            }
          } catch { continue; }
        }
      } catch { /* silent */ }
      finally { setPlansLoading(false); }
    })();
  }, []);

  const phoneDigitsForRequests = (form.phone || "").replace(/\D/g, "").slice(0, 10);
  const phoneIsValid = phoneDigitsForRequests.length === 10;
  const canSaveProfile = !saving && phoneIsValid && (form.name || "").trim().length >= 2 && (form.email || "").trim().length > 0;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = ev => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!profile?.id) return;
    if (!phoneIsValid) {
      setSaveMsg("ERROR::Phone number is mandatory (10 digits).");
      setTimeout(() => setSaveMsg(""), 5000);
      return;
    }
    setSaving(true); setSaveMsg("");
    try {
      const payload: any = {
        name: form.name.trim(),
        email: form.email.trim(),
        location: form.location.trim(),
        phoneNumber: phoneDigitsForRequests,
        ...(form.designation.trim() ? { designation: form.designation.trim() } : {}),
        ...(form.organizationName.trim() ? { organizationName: form.organizationName.trim() } : {}),
      };
      const onboardingForm = new FormData();
      onboardingForm.append("data", new Blob([JSON.stringify(payload)], { type: "application/json" }));
      if (avatarFile) onboardingForm.append("file", avatarFile);

      try {
        await apiFetch(`/onboarding/${profile.id}`, { method: "PUT", body: onboardingForm });
      } catch {
        await apiFetch(`/users/${profile.id}`, { method: "PUT", body: JSON.stringify(payload) });
      }

      setProfile(prev => prev ? { ...prev, ...form } : prev);
      setEditing(false);
      setSaveMsg("SUCCESS::🙌 Profile updated successfully!");
      setTimeout(() => setSaveMsg(""), 4000);
    } catch (e: any) {
      setSaveMsg(`ERROR::${e.message || "Update failed"}`);
    } finally { setSaving(false); }
  };

  if (loading) return <MeetTheMastersLoader message="Loading profile..." padding={40} />;
  if (!profile) return <div style={{ padding: 40, textAlign: "center", color: "#EF4444" }}>Failed to load profile. Please log in again.</div>;

  const isPremium = profile.subscribed || (profile.subscriptionPlanName && profile.subscriptionPlanName !== "Guest");
  const isAdminMember = (profile.role || "").toUpperCase() === "MEMBER";
  const currentPlanName = profile.subscriptionPlanName || (isAdminMember ? "Premium (Free)" : isPremium ? "Premium" : "Guest");
  const initials = (profile.name || "U").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    border: "1.5px solid #BFDBFE",
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    background: "#F8FBFF",
    color: "#1E293B",
    boxSizing: "border-box"
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#64748B", fontWeight: 600, cursor: "pointer", marginBottom: 20 }}>
        <Settings size={16} /> Back to Dashboard
      </button>

      <div style={{ background: "#fff", borderRadius: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        {/* Header / Avatar Section */}
        <div style={{ background: "linear-gradient(135deg, #1E3A5F, #2563EB)", padding: "40px 32px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ position: "relative" }}>
              <div style={{ width: 100, height: 100, borderRadius: "50%", background: "#fff", border: "4px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontSize: 36, fontWeight: 800, color: "#2563EB" }}>
                {avatarPreview ? <img src={avatarPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
              </div>
              {editing && (
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  style={{ position: "absolute", bottom: 0, right: 0, width: 32, height: 32, borderRadius: "50%", background: "#fff", border: "none", boxShadow: "0 4px 10px rgba(0,0,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#2563EB" }}
                >
                  <Camera size={16} />
                </button>
              )}
              <input type="file" ref={avatarInputRef} hidden accept="image/*" onChange={handleAvatarChange} />
            </div>
            <div>
              <h2 style={{ margin: 0, color: "#fff", fontSize: 28, fontWeight: 800 }}>{profile.name || "User"}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ padding: "4px 12px", borderRadius: 99, background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
                  {profile.role || "USER"}
                </span>
                <span style={{ color: "#BFDBFE", fontSize: 14, display: "flex", alignItems: "center", gap: 4 }}>
                  <Clock size={14} /> Member since {new Date(profile.createdAt || Date.now()).getFullYear()}
                </span>
              </div>
            </div>
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              style={{ position: "absolute", top: 32, right: 32, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "8px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(4px)" }}
            >
              <Edit2 size={14} /> Edit Profile
            </button>
          )}
        </div>

        {/* Content Tabs / Forms */}
        <div style={{ padding: 32 }}>
          {saveMsg && (
            <div style={{
              marginBottom: 20, padding: "12px 16px", borderRadius: 12, fontSize: 14, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 8,
              background: saveMsg.startsWith("SUCCESS") ? "#ECFDF5" : "#FEF2F2",
              color: saveMsg.startsWith("SUCCESS") ? "#059669" : "#DC2626",
              border: `1px solid ${saveMsg.startsWith("SUCCESS") ? "#10B981" : "#FCA5A5"}`
            }}>
              {saveMsg.startsWith("SUCCESS") ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
              {saveMsg.split("::")[1]}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
            {/* Personal Information */}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#1E3A5F", display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <User size={18} /> Personal Information
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 6, display: "block" }}>Full Name</label>
                  {editing ? <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /> : <p style={{ margin: 0, fontSize: 14, color: "#1E293B", fontWeight: 600 }}>{profile.name || "—"}</p>}
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 6, display: "block" }}>Email Address</label>
                  {editing ? <input style={inputStyle} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /> : <p style={{ margin: 0, fontSize: 14, color: "#1E293B", fontWeight: 600 }}>{profile.email || "—"}</p>}
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 6, display: "block" }}>Phone Number</label>
                  {editing ? <input style={inputStyle} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /> : <p style={{ margin: 0, fontSize: 14, color: "#1E293B", fontWeight: 600 }}>{profile.phone || "—"}</p>}
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 6, display: "block" }}>Location</label>
                  {editing ? <input style={inputStyle} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /> : <p style={{ margin: 0, fontSize: 14, color: "#1E293B", fontWeight: 600 }}>{profile.location || "—"}</p>}
                </div>
              </div>
            </div>

            {/* Professional Details */}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#1E3A5F", display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <Shield size={18} /> Professional Details
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 6, display: "block" }}>Designation</label>
                  {editing ? <input style={inputStyle} value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} /> : <p style={{ margin: 0, fontSize: 14, color: "#1E293B", fontWeight: 600 }}>{profile.designation || "—"}</p>}
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 6, display: "block" }}>Organization</label>
                  {editing ? <input style={inputStyle} value={form.organizationName} onChange={e => setForm({ ...form, organizationName: e.target.value })} /> : <p style={{ margin: 0, fontSize: 14, color: "#1E293B", fontWeight: 600 }}>{profile.organizationName || "—"}</p>}
                </div>
              </div>
            </div>
          </div>

          {editing && (
            <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                style={{ padding: "10px 24px", borderRadius: 12, fontSize: 14, fontWeight: 700, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSaveProfile}
                style={{ padding: "10px 28px", borderRadius: 12, fontSize: 14, fontWeight: 700, border: "none", background: canSaveProfile ? "linear-gradient(135deg, #1E3A5F, #2563EB)" : "#CBD5E1", color: "#fff", cursor: canSaveProfile ? "pointer" : "default", boxShadow: canSaveProfile ? "0 4px 12px rgba(37,99,235,0.2)" : "none" }}
              >
                {saving ? "Saving Changes..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
