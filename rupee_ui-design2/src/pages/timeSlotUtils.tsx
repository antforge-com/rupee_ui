/**
 * timeSlotUtils.tsx
 * Shared utilities for duration-aware time slot selection.
 * Used by: AdminPage (Master Time Slots panel) and AddAdvisor (Add Consultant modal).
 * Keeping this separate avoids circular imports between pages/AdminPage and components/AddAdvisor.
 */
import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export const durationMinutesToHours = (value: any, fallback = 1): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  if (parsed <= 12) return Math.max(1, Math.min(3, Math.round(parsed)));
  return Math.max(1, Math.min(3, Math.round(parsed / 60)));
};

export const durationHoursToMinutes = (value: any, fallback = 1): number =>
  durationMinutesToHours(value, fallback) * 60;

export const formatHourRangeLabel = (startHour24: number, durationHours = 1): string => {
  const formatHour = (hour24: number) => {
    const normalizedHour = ((hour24 % 24) + 24) % 24;
    const period = normalizedHour >= 12 ? "PM" : "AM";
    const hour12 = normalizedHour % 12 || 12;
    return `${hour12}:00 ${period}`;
  };
  return `${formatHour(startHour24)} - ${formatHour(startHour24 + Math.max(1, durationHours))}`;
};

export const parseStartHourFromRange = (timeRange: string): number | null => {
  const match = String(timeRange || "").trim().match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM)\s*[--]\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i
  );
  if (!match) return null;
  const [, startHourText, startMinuteText, startPeriod] = match;
  if (startMinuteText !== "00") return null;
  let startHour = Number(startHourText) % 12;
  if (startPeriod.toUpperCase() === "PM") startHour += 12;
  return startHour;
};

// ─────────────────────────────────────────────────────────────────────────────
// HOUR RANGE CLOCK PICKER
// Visual clock that selects a start hour + duration (1/2/3 hrs).
// Shared between AdminPage Master Time Slots and AddAdvisor modal.
// ─────────────────────────────────────────────────────────────────────────────

export const HourRangeClockPicker: React.FC<{
  isOpen: boolean;
  title: string;
  initialHour: number | null;
  initialDuration?: number;
  onClose: () => void;
  onSave: (startHour24: number, durationHours: number) => void;
}> = ({ isOpen, title, initialHour, initialDuration = 1, onClose, onSave }) => {
  const [selectedHour, setSelectedHour] = React.useState(12);
  const [period, setPeriod] = React.useState<"AM" | "PM">("PM");
  const [durationHours, setDurationHours] = React.useState(initialDuration);

  React.useEffect(() => {
    if (!isOpen) return;
    const baseHour = initialHour ?? 12;
    setSelectedHour(baseHour % 12 || 12);
    setPeriod(baseHour >= 12 ? "PM" : "AM");
    setDurationHours(initialDuration);
  }, [initialHour, initialDuration, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    let startHour24 = selectedHour % 12;
    if (period === "PM") startHour24 += 12;
    onSave(startHour24, durationHours);
  };

  const start24 = (selectedHour % 12) + (period === "PM" ? 12 : 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "radial-gradient(circle at top, rgba(59,130,246,0.16), rgba(15,23,42,0.68))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        backdropFilter: "blur(10px)",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 344,
          maxWidth: "100%",
          background: "linear-gradient(180deg, #FFFFFF 0%, #F0FDFA 100%)",
          borderRadius: 24,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(15,23,42,0.34)",
          border: "1px solid rgba(255,255,255,0.6)",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            position: "relative",
            background: "linear-gradient(145deg,#0F3CC9 0%,#0F766E 58%,#2DD4BF 100%)",
            padding: "18px 20px 16px",
            color: "#fff",
          }}
        >
          <div style={{ position: "absolute", top: -70, right: -40, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.10)" }} />
          <div style={{ position: "absolute", bottom: -60, left: -30, width: 110, height: 110, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.18)", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FDE68A", boxShadow: "0 0 16px rgba(253,230,138,0.9)" }} />
              {title}
            </div>

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 34, lineHeight: 1.05, fontWeight: 900, letterSpacing: "-0.04em" }}>
                  {formatHourRangeLabel(start24, durationHours)}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,0.88)", maxWidth: 210 }}>
                  Pick the starting hour. End time is added automatically.
                </div>
                {/* Duration pills */}
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  {[1, 2, 3].map((hrs) => (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => setDurationHours(hrs)}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.35)",
                        background: durationHours === hrs ? "#fff" : "rgba(255,255,255,0.12)",
                        color: durationHours === hrs ? "#0D9488" : "#fff",
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer",
                        boxShadow: durationHours === hrs ? "0 6px 14px rgba(15,23,42,0.15)" : "none",
                      }}
                    >
                      {hrs} hr
                    </button>
                  ))}
                </div>
              </div>
              {/* AM / PM */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
                <button type="button" onClick={() => setPeriod("AM")} style={{ minWidth: 48, padding: "8px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.28)", background: period === "AM" ? "#fff" : "rgba(255,255,255,0.08)", color: period === "AM" ? "#0D9488" : "#fff", fontSize: 11, fontWeight: 900, cursor: "pointer", boxShadow: period === "AM" ? "0 10px 22px rgba(15,23,42,0.18)" : "none" }}>AM</button>
                <button type="button" onClick={() => setPeriod("PM")} style={{ minWidth: 48, padding: "8px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.28)", background: period === "PM" ? "#fff" : "rgba(255,255,255,0.08)", color: period === "PM" ? "#0D9488" : "#fff", fontSize: 11, fontWeight: 900, cursor: "pointer", boxShadow: period === "PM" ? "0 10px 22px rgba(15,23,42,0.18)" : "none" }}>PM</button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Clock Face ── */}
        <div style={{ padding: "18px 18px 4px", display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle at center, #FFFFFF 0%, #F6FAFF 68%, #EDF4FF 100%)", border: "1px solid #D7E6FF", boxShadow: "inset 0 12px 30px rgba(255,255,255,0.95), 0 18px 40px rgba(15,118,110,0.10)" }}>
            <div style={{ position: "absolute", inset: 15, borderRadius: "50%", border: "1px dashed rgba(148,163,184,0.25)" }} />
            <div style={{ position: "absolute", top: "50%", left: "50%", width: 12, height: 12, borderRadius: "50%", background: "#0F766E", border: "3px solid #CFFAFE", transform: "translate(-50%, -50%)", zIndex: 3, boxShadow: "0 0 0 6px rgba(15,118,110,0.08)" }} />

            {([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const).map((hour, index) => {
              const angle = index * 30 * (Math.PI / 180);
              const radius = 83;
              const x = 110 + radius * Math.sin(angle);
              const y = 110 - radius * Math.cos(angle);
              const isActive = selectedHour === hour;
              return (
                <React.Fragment key={hour}>
                  {isActive && (
                    <>
                      <div style={{ position: "absolute", top: "50%", left: "50%", width: 3, height: radius, background: "linear-gradient(180deg, #2DD4BF 0%, #0F766E 100%)", borderRadius: 999, transformOrigin: "bottom center", transform: `translate(-50%,-100%) rotate(${index * 30}deg)`, zIndex: 1, boxShadow: "0 0 14px rgba(15,118,110,0.18)" }} />
                      <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", width: 44, height: 44, borderRadius: "50%", background: "rgba(15,118,110,0.12)", zIndex: 1 }} />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedHour(hour)}
                    style={{
                      position: "absolute",
                      left: x,
                      top: y,
                      transform: "translate(-50%, -50%)",
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      border: isActive ? "none" : "1px solid transparent",
                      background: isActive ? "linear-gradient(145deg,#0F766E,#0D9488)" : "transparent",
                      color: isActive ? "#fff" : "#334155",
                      fontSize: 16,
                      fontWeight: isActive ? 800 : 700,
                      cursor: "pointer",
                      zIndex: 3,
                      boxShadow: isActive ? "0 12px 28px rgba(15,118,110,0.30)" : "none",
                    }}
                  >
                    {hour}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: "10px 18px 18px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #CBD5E1", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{ padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(145deg,#0F766E,#0D9488)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 12px 24px rgba(15,118,110,0.26)" }}
            >
              Use This Slot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};