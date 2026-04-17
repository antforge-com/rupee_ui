export const normalizeSpaces = (value: string): string =>
    String(value ?? "").replace(/\s+/g, " ").trim();

export const stripLeadingNumberText = (value: string): string =>
    String(value ?? "").replace(/^\s*\d+\s*/, "");

export const startsWithNumber = (value: string): boolean =>
    /^\d/.test(String(value ?? "").trimStart());

const capitalizeWord = (word: string): string =>
    word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : "";

export const toTitleCaseWords = (value: string): string =>
    normalizeSpaces(stripLeadingNumberText(value))
        .split(" ")
        .filter(Boolean)
        .map((word) => word.split("-").map(capitalizeWord).join("-"))
        .join(" ");

export const formatNameLikeValue = (value: string): string =>
    toTitleCaseWords(value);

export const formatNameLikeInput = (value: string): string => {
    const sanitized = stripLeadingNumberText(String(value ?? "")).replace(/^\s+/, "");
    if (!sanitized) return "";
    const hasTrailingSpace = /\s$/.test(sanitized);
    const normalized = toTitleCaseWords(sanitized);
    return hasTrailingSpace && normalized ? `${normalized} ` : normalized;
};

export const capitalizeFirstCharacter = (value: string): string => {
    const sanitized = stripLeadingNumberText(String(value ?? ""));
    const index = sanitized.search(/[A-Za-z]/);
    if (index < 0) return sanitized;
    return `${sanitized.slice(0, index)}${sanitized.charAt(index).toUpperCase()}${sanitized.slice(index + 1)}`;
};

export const canonicalTextKey = (value: string): string =>
    normalizeSpaces(String(value ?? "")).toLowerCase();

export const formatIndianNumber = (value: number | string): string => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return "0";
    return numeric.toLocaleString("en-IN");
};

export const formatIndianCurrency = (value: number | string, withSymbol = true): string => {
    const formatted = formatIndianNumber(value);
    return withSymbol ? `₹${formatted}` : formatted;
};

export const sanitizeWholeNumberInput = (value: string, max?: number): string => {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (!digits) return "";
    const numeric = Number(digits);
    if (typeof max === "number" && Number.isFinite(max) && numeric > max) return String(max);
    return digits.replace(/^0+(?=\d)/, "");
};

export const sanitizeDecimalInput = (
    value: string,
    max?: number,
    fractionDigits = 2,
): string => {
    const cleaned = String(value ?? "").replace(/[^\d.]/g, "");
    if (!cleaned) return "";

    const [whole = "", ...fractionParts] = cleaned.split(".");
    const fraction = fractionParts.join("").slice(0, Math.max(0, fractionDigits));
    const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
    const normalized = fractionParts.length > 0
        ? `${normalizedWhole || "0"}.${fraction}`
        : normalizedWhole;

    if (!normalized) return "";
    const numeric = Number(normalized);
    if (typeof max === "number" && Number.isFinite(max) && numeric > max) return String(max);
    return normalized;
};
