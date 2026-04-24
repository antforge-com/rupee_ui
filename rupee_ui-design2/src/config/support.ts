const DEFAULT_SUPPORT_EMAIL = "support@meetthemasters.in";

export const SUPPORT_EMAIL = (() => {
  const raw = String(import.meta.env.VITE_SUPPORT_EMAIL || "").trim();
  return raw || DEFAULT_SUPPORT_EMAIL;
})();

