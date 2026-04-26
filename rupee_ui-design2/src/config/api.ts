const DEFAULT_API_URL = "http://52.55.178.31:8081/api";

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

const normalizeApiPath = (pathname: string): string => {
  const cleanPath = stripTrailingSlashes(pathname || "");

  if (!cleanPath || cleanPath === "/") return "";
  if (/\/swagger-ui(?:\/|$)/i.test(cleanPath)) return "/api";
  if (/\/v3\/api-docs(?:\/|$)/i.test(cleanPath)) return "/api";

  return cleanPath;
};

const resolveApiBaseUrl = (rawValue?: string): string => {
  const candidate = (rawValue || DEFAULT_API_URL).trim();

  try {
    const parsed = new URL(candidate);
    const path = normalizeApiPath(parsed.pathname);
    return `${parsed.origin}${path}`;
  } catch {
    return DEFAULT_API_URL;
  }
};

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
export const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return "http://52.55.178.31:8081";
  }
})();

export const buildApiUrl = (path: string): string => {
  if (!path) return API_BASE_URL;
  if (/^https?:\/\//i.test(path)) return path;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

export const buildBackendAssetUrl = (path: string | null | undefined): string => {
  if (!path) return "";
  if (/^(?:https?:|blob:|data:)/i.test(path)) return path;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_ORIGIN}${normalizedPath}`;
};
