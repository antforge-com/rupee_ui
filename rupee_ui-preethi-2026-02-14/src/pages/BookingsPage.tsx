import { useEffect, useState } from "react";
import {
  createTimeslot,
  deleteTimeslot,
  getConsultantById,
  getTimeslotsByConsultant,
} from "../services/api";
import styles from "../styles/BookingsPage.module.css";

interface Slot {
  id: number;
  slotDate: string;
  slotTime: string;
  slotEndTime?: string;
  durationMinutes: number;
  isBooked: boolean;
  consultantId: number;
}

// ── Time helpers ─────────────────────────────────────────────────────────────

const toAmPm = (time: string): string => {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr || 0);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  const min = String(m).padStart(2, "0");
  return `${hour}:${min} ${ampm}`;
};

const formatTimeRange = (
  slotTime: string,
  durationMinutes: number,
  slotEndTime?: string
): string => {
  const startStr = toAmPm(slotTime);
  if (slotEndTime) return `${startStr} – ${toAmPm(slotEndTime)}`;
  const [hStr, mStr] = slotTime.split(":");
  const totalMins = Number(hStr) * 60 + Number(mStr || 0) + durationMinutes;
  const endH = Math.floor(totalMins / 60) % 24;
  const endM = totalMins % 60;
  const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  return `${startStr} – ${toAmPm(endTime)}`;
};

const padHour = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * Robustly parse any time value to an hour (0–23).
 */
const parseToHour = (val: any): number | null => {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : Math.floor(val);
  const s = String(val).trim();
  if (/^\d{1,2}:\d{2}/.test(s)) {
    const h = Number(s.split(":")[0]);
    return isNaN(h) ? null : h;
  }
  if (/^\d{1,2}$/.test(s)) {
    const h = Number(s);
    return isNaN(h) ? null : h;
  }
  const ampm = s.match(/^(\d{1,2})(?::\d{2})?\s*(AM|PM)/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const p = ampm[2].toUpperCase();
    if (p === "PM" && h !== 12) h += 12;
    if (p === "AM" && h === 12) h = 0;
    return isNaN(h) ? null : h;
  }
  return null;
};

/**
 * Extracts shift boundaries strictly looking for "shiftTimings" 
 * to align perfectly with the Java Backend format (e.g., "09:00 AM - 05:00 PM")
 */
const getShiftFromProfile = (
  p: any
): { startHour: number | null; endHour: number | null } => {
  if (!p) return { startHour: null, endHour: null };

  // 1. Explicitly check for the Java backend field "shiftTimings" with hyphen format
  if (p.shiftTimings && typeof p.shiftTimings === "string" && p.shiftTimings.includes("-")) {
    const parts = p.shiftTimings.split("-");
    const s = parseToHour(parts[0].trim());
    const e = parseToHour(parts[1].trim());
    if (s !== null && e !== null) {
      return { startHour: s, endHour: e };
    }
  }

  // 2. Fallbacks for other possible names to prevent removal of existing logic
  const startRaw = p.shiftStart ?? p.shiftStartTime ?? p.shift_start ?? p.startHour ?? null;
  const endRaw = p.shiftEnd ?? p.shiftEndTime ?? p.shift_end ?? p.endHour ?? null;

  let startHour = parseToHour(startRaw);
  let endHour   = parseToHour(endRaw);

  const nested = p.shift ?? p.availability ?? null;
  if (nested && typeof nested === "object") {
    if (startHour === null) startHour = parseToHour(nested.start ?? nested.startTime ?? null);
    if (endHour === null) endHour = parseToHour(nested.end ?? nested.endTime ?? null);
  }

  return { startHour, endHour };
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function MySlotsPage() {
  const [slots, setSlots]             = useState<Slot[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [addingSlot, setAddingSlot]   = useState(false);

  const [shiftHours, setShiftHours]   = useState<number[]>([]);
  const [shiftLabel, setShiftLabel]   = useState<string>("");
  const [shiftError, setShiftError]   = useState<string | null>(null);

  const [formDate, setFormDate]         = useState("");
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [formError, setFormError]       = useState<string | null>(null);

  const getConsultantId = (): number => {
    const stored =
      localStorage.getItem("fin_consultant_id") ||
      localStorage.getItem("consultant_id")     ||
      localStorage.getItem("userId");
    return stored ? Number(stored) : 0;
  };

  const mapSlot = (s: any): Slot => ({
    id: s.id,
    slotDate: s.slotDate || s.date || "",
    slotTime: (s.slotTime || s.time || "").substring(0, 5),
    slotEndTime: s.slotEndTime
      ? s.slotEndTime.substring(0, 5)
      : s.endTime
      ? s.endTime.substring(0, 5)
      : undefined,
    durationMinutes: Number(s.durationMinutes || s.duration || 60),
    isBooked: s.isBooked ?? s.booked ?? false,
    consultantId: s.consultantId || s.consultant?.id || 0,
  });

  const loadShiftTimings = async (consultantId: number) => {
    try {
      const profile = await getConsultantById(consultantId);
      const { startHour, endHour } = getShiftFromProfile(profile);

      if (startHour !== null && endHour !== null && endHour > startHour) {
        const hours: number[] = [];
        for (let h = startHour; h < endHour; h++) hours.push(h);
        setShiftHours(hours);
        setShiftLabel(
          `${toAmPm(padHour(startHour))} – ${toAmPm(padHour(endHour))}`
        );
        setShiftError(null);
      } else {
        setShiftHours([]);
        setShiftLabel("");
        setShiftError("Shift timings not set correctly in your profile.");
      }
    } catch (err) {
      setShiftHours([]);
      setShiftLabel("");
      setShiftError("Could not load shift timings from your profile.");
    }
  };

  const fetchSlots = async () => {
    try {
      const consultantId = getConsultantId();
      if (!consultantId) return;

      const data = await getTimeslotsByConsultant(consultantId);
      const mapped = Array.isArray(data) ? data.map(mapSlot) : [];
      mapped.sort((a, b) =>
        a.slotDate + a.slotTime < b.slotDate + b.slotTime ? -1 : 1
      );
      setSlots(mapped);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch slots.");
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      const consultantId = getConsultantId();
      if (!consultantId) {
        setError("Consultant ID not found. Please log in again.");
        setLoading(false);
        return;
      }
      await Promise.all([loadShiftTimings(consultantId), fetchSlots()]);
      setLoading(false);
    };
    init();
    // eslint-disable-next-line
  }, []);

  const handleAddSlot = async () => {
    setFormError(null);
    if (!formDate)          { setFormError("Please select a date."); return; }
    if (selectedHour === null) { setFormError("Please select a time slot."); return; }

    const consultantId = getConsultantId();
    if (!consultantId)      { setFormError("Consultant ID not found."); return; }

    const slotTime = padHour(selectedHour);

    if (slots.some((s) => s.slotDate === formDate && s.slotTime === slotTime)) {
      setFormError("A slot already exists for this date and time.");
      return;
    }

    setAddingSlot(true);
    try {
      await createTimeslot({ consultantId, slotDate: formDate, slotTime, durationMinutes: 60 });
      setFormDate("");
      setSelectedHour(null);
      await fetchSlots();
    } catch (err: any) {
      setFormError(err?.message || "Failed to add slot.");
    } finally {
      setAddingSlot(false);
    }
  };

  const handleDelete = async (slot: Slot) => {
    if (slot.isBooked) { alert("Cannot delete a booked slot."); return; }
    if (!window.confirm("Delete this slot?")) return;
    try {
      await deleteTimeslot(slot.id);
      setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    } catch {
      alert("Failed to delete slot.");
    }
  };

  const isAlreadyAdded = (hour: number) =>
    formDate
      ? slots.some(
          (s) => s.slotDate === formDate && Number(s.slotTime.split(":")[0]) === hour
        )
      : false;

  const availableCount = slots.filter((s) => !s.isBooked).length;
  const bookedCount    = slots.filter((s) => s.isBooked).length;

  // ── 30-Day Logic Generator ──
  const generateMonthDays = () => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push(d.toISOString().split("T")[0]);
    }
    return days;
  };
  const monthDays = generateMonthDays();

  // Handle single click toggle directly on the grid
  const handleToggleMonthSlot = async (date: string, hour: number, existingSlot: Slot | undefined) => {
    if (existingSlot) {
      if (existingSlot.isBooked) {
        alert("This slot is already booked and cannot be modified.");
        return;
      }
      try {
        await deleteTimeslot(existingSlot.id);
        setSlots((prev) => prev.filter((s) => s.id !== existingSlot.id));
      } catch (e) {
        alert("Failed to make slot unavailable.");
      }
    } else {
      try {
        const consultantId = getConsultantId();
        if (!consultantId) return;
        await createTimeslot({ consultantId, slotDate: date, slotTime: padHour(hour), durationMinutes: 60 });
        fetchSlots();
      } catch (e) {
        alert("Failed to make slot available.");
      }
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <h2 className={styles.title}>Manage Availability</h2>

      {/* ── Form Card ── */}
      <div className={styles.formCard}>
        <div className={styles.formTopRow}>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>DATE</label>
            <input
              type="date"
              className={styles.fieldInput}
              value={formDate}
              onChange={(e) => {
                setFormDate(e.target.value);
                setSelectedHour(null);
                setFormError(null);
              }}
              min={new Date().toISOString().split("T")[0]}
            />
          </div>
          <button
            className={styles.addBtn}
            onClick={handleAddSlot}
            disabled={addingSlot || !formDate || selectedHour === null}
          >
            {addingSlot ? "Adding…" : "+ Add Slot"}
          </button>
        </div>

        <div className={styles.timeSection}>
          <label className={styles.fieldLabel}>
            TIME
            {shiftLabel && (
              <span className={styles.shiftBadge}>Shift: {shiftLabel}</span>
            )}
          </label>

          {loading ? (
            <div className={styles.chipsLoading}>
              <div className={styles.spinnerSm} /> Loading shift timings…
            </div>
          ) : shiftHours.length > 0 ? (
            <div className={styles.timeChipsWrap}>
              {shiftHours.map((hour) => {
                const added    = isAlreadyAdded(hour);
                const selected = selectedHour === hour;
                return (
                  <button
                    key={hour}
                    type="button"
                    disabled={added}
                    onClick={() => {
                      setSelectedHour(selected ? null : hour);
                      setFormError(null);
                    }}
                    className={`${styles.timeChip} ${
                      selected ? styles.chipSelected :
                      added    ? styles.chipDisabled :
                                 styles.chipIdle
                    }`}
                    title={
                      added
                        ? "Already added for this date"
                        : `${toAmPm(padHour(hour))} – ${toAmPm(padHour(hour + 1))}`
                    }
                  >
                    <span className={styles.chipStart}>{toAmPm(padHour(hour))}</span>
                    <span className={styles.chipSep}>–</span>
                    <span className={styles.chipEnd}>{toAmPm(padHour(hour + 1))}</span>
                  </button>
                );
              })}
            </div>
          ) : shiftError ? (
            <div className={styles.shiftWarn}>⚠️ {shiftError}</div>
          ) : null}
        </div>

        {formError && <p className={styles.formError}>⚠️ {formError}</p>}
      </div>

      {error && (
        <div className={styles.errorBox}>
          ⚠️ {error}
          <button className={styles.retryBtn} onClick={fetchSlots}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading slots…</span>
        </div>
      ) : (
        <>
          <div className={styles.summaryRow}>
            <div className={styles.summaryChip}>
              <span className={styles.dotBlue} />
              Available: <strong>{availableCount}</strong>
            </div>
            <div className={styles.summaryChip}>
              <span className={styles.dotGray} />
              Booked: <strong>{bookedCount}</strong>
            </div>
            <div className={styles.summaryChip}>
              Total: <strong>{slots.length}</strong>
            </div>
          </div>

          {/* ── Retained Legacy Grid (Unmodified) ── */}
          {slots.length === 0 && (
             <div className={styles.emptyState}>
               <svg width="44" height="44" fill="none" viewBox="0 0 24 24"
                 style={{ margin: "0 auto 12px", display: "block" }}>
                 <rect x="3" y="4" width="18" height="18" rx="2"
                   stroke="#CBD5E1" strokeWidth="1.5" />
                 <path d="M16 2v4M8 2v4M3 10h18"
                   stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
               </svg>
               <p style={{ color: "#94A3B8", margin: 0 }}>
                 No manual slots added yet. Check your monthly schedule below.
               </p>
             </div>
          )}
          {slots.length > 0 && (
            <div className={styles.slotsGrid}>
              {slots.map((slot) => (
                <div
                  key={slot.id}
                  className={`${styles.slotCard} ${
                    slot.isBooked ? styles.slotCardBooked : styles.slotCardAvailable
                  }`}
                >
                  <div className={`${styles.slotCardDate} ${slot.isBooked ? styles.strike : ""}`}>
                    {slot.slotDate}
                  </div>
                  <div className={`${styles.slotCardTime} ${slot.isBooked ? styles.strike : ""}`}>
                    {formatTimeRange(slot.slotTime, slot.durationMinutes, slot.slotEndTime)}
                  </div>
                  <div className={styles.slotCardFooter}>
                    <span className={`${styles.badge} ${slot.isBooked ? styles.badgeBooked : styles.badgeAvailable}`}>
                      {slot.isBooked ? "BOOKED" : "AVAILABLE"}
                    </span>
                    {!slot.isBooked && (
                      <button className={styles.cardDeleteBtn} onClick={() => handleDelete(slot)} title="Delete">
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── NEW: 30-Day Auto-Generated Schedule View ── */}
          {shiftHours.length > 0 && (
            <div className={styles.monthViewContainer}>
              <h3 className={styles.monthViewTitle}>My 30-Day Schedule</h3>
              <p className={styles.monthViewDesc}>
                This grid automatically loads your 1-hour slots based on your shift timings (<b>{shiftLabel}</b>). <br/>
                Click any slot below to instantly open or close it. <br/>
                <span style={{ color: '#2563EB', fontWeight: 600 }}>Blue</span> = Available |{" "}
                <span style={{ color: '#94A3B8', textDecoration: 'line-through' }}>Gray</span> = Unavailable / Booked
              </p>
              
              <div className={styles.monthGrid}>
                {monthDays.map((date) => {
                  return (
                    <div key={date} className={styles.dayRow}>
                      <div className={styles.dayDate}>
                        {new Date(date).toLocaleDateString(undefined, { 
                          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' 
                        })}
                      </div>
                      <div className={styles.daySlots}>
                        {shiftHours.map((hour) => {
                          // Find if the slot was actually created on backend
                          const slot = slots.find((s) => s.slotDate === date && Number(s.slotTime.split(":")[0]) === hour);
                          
                          // If it exists in DB and is NOT booked, it's Blue
                          const isAvailable = !!slot && !slot.isBooked;

                          let btnClass = styles.slotBtnUnavailable;
                          if (isAvailable) btnClass = styles.slotBtnAvailable;

                          return (
                            <button
                              key={hour}
                              className={`${styles.slotBtn} ${btnClass}`}
                              onClick={() => handleToggleMonthSlot(date, hour, slot)}
                              title={isAvailable ? "Click to mark Unavailable" : slot?.isBooked ? "This slot is booked" : "Click to mark Available"}
                            >
                              {toAmPm(padHour(hour))} – {toAmPm(padHour(hour + 1))}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}