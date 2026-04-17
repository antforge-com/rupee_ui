import type { CSSProperties } from "react";

import { API_BASE_URL } from "../config/api";
import { getRole } from "../services/api";
import { decryptLocal } from "../services/crypto";

export interface Offer {
  id: number;
  title: string;
  description: string;
  discount?: string;
  validUntil?: string;
  validTo?: string;
  validFrom?: string;
  isActive?: boolean;
  active?: boolean;
  approvalStatus?: string;
  status?: string;
  consultantId?: number | null;
  consultantName?: string;
}

export interface Review {
  id: number;
  reviewerName: string;
  rating: number;
  reviewText: string;
  consultantName?: string;
  createdAt?: string;
  isApproved?: boolean;
}

const BASE = API_BASE_URL;

const normalizeRole = (raw?: string | null) =>
  (raw || "").toUpperCase().trim().replace(/^ROLE_/, "");

export const getStoredRole = () => {
  const rawRole = getRole();
  if (!rawRole) return "";
  const decodedRole = decryptLocal(rawRole);
  return normalizeRole(decodedRole || rawRole);
};

const safeFetch = async (
  ep: string,
  includeAuth = false,
): Promise<{ ok: boolean; status: number; data: any }> => {
  try {
    const token = localStorage.getItem("fin_token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (includeAuth && token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE}${ep}`, { headers, cache: "no-store" });
    let data: any = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
};

const toArray = (data: any): any[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.content)) return data.content;
  const keys = ["offers", "reviews", "feedbacks", "data", "items", "results"];
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }
  if (typeof data === "object" && data.id != null) return [data];
  return [];
};

const loadArrayFromEndpoint = async (ep: string, allowAuthFallback = false): Promise<any[]> => {
  const publicResult = await safeFetch(ep);
  if (publicResult.ok && publicResult.data) {
    const items = toArray(publicResult.data);
    if (items.length > 0) return items;
  }

  const token = localStorage.getItem("fin_token");
  if (!allowAuthFallback || !token) return [];

  const authResult = await safeFetch(ep, true);
  if (!authResult.ok || !authResult.data) return [];
  return toArray(authResult.data);
};

export const loadAllActiveOffers = async (): Promise<Offer[]> => {
  const all: any[] = [];
  const sources = [
    { ep: "/offers/checkout", allowAuthFallback: true },
    { ep: "/offers/public", allowAuthFallback: false },
    { ep: "/offers", allowAuthFallback: true },
  ];

  for (const source of sources) {
    const items = await loadArrayFromEndpoint(source.ep, source.allowAuthFallback);
    if (items.length > 0) {
      all.push(...items);
    }
  }

  const seen = new Set<number>();
  const unique = all.filter((offer: any) => {
    if (!offer?.id || !offer?.title) return false;
    const id = Number(offer.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return unique.filter((offer: any) => {
    const status = String(offer.approvalStatus ?? offer.status ?? "APPROVED").toUpperCase().trim();
    if (status === "REJECTED" || status === "PENDING") return false;
    if (offer.isActive === false || offer.active === false) return false;
    return true;
  }) as Offer[];
};

export const loadReviews = async (): Promise<Review[]> => {
  const endpoints = [
    { ep: "/reviews?approved=true", allowAuthFallback: false },
    { ep: "/reviews/approved", allowAuthFallback: false },
    { ep: "/reviews", allowAuthFallback: true },
    { ep: "/feedbacks", allowAuthFallback: true },
  ];
  let combined: any[] = [];

  for (const endpoint of endpoints) {
    combined = await loadArrayFromEndpoint(endpoint.ep, endpoint.allowAuthFallback);
    if (combined.length > 0) break;
  }

  const seen = new Set<number>();
  const result: Review[] = [];

  for (const review of combined) {
    if (!review?.id || seen.has(review.id)) continue;
    seen.add(review.id);
    if (review.isApproved === false || review.approved === false) continue;

    const reviewText = review.reviewText ?? review.comment ?? review.text ?? review.message ?? review.comments ?? "";
    const rating = Number(review.rating ?? review.feedbackRating ?? review.stars ?? 0);
    if (!reviewText.trim() || !(rating >= 3)) continue;

    result.push({
      id: review.id,
      reviewerName: review.reviewerName ?? review.userName ?? review.user?.name ?? review.clientName ?? "Verified Client",
      rating,
      reviewText,
      consultantName: review.consultantName ?? review.consultant?.name ?? "",
      createdAt: review.createdAt ?? review.created_at ?? "",
      isApproved: review.isApproved !== false,
    });
  }

  return result.sort((a, b) => b.rating - a.rating).slice(0, 6);
};

export const getOfferLabel = (offer: Offer): { label: string; style: CSSProperties } | null => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const validToRaw = offer.validTo ?? offer.validUntil;
  if (validToRaw) {
    const date = new Date(validToRaw);
    date.setHours(0, 0, 0, 0);
    if (date.getTime() === today.getTime()) {
      return {
        label: "LAST CALL",
        style: {
          background: "linear-gradient(135deg, #DC2626, #EF4444)",
          color: "#fff",
          padding: "4px 10px",
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          boxShadow: "0 8px 20px rgba(239,68,68,0.28)",
        },
      };
    }
  }

  const validFromRaw = offer.validFrom;
  if (validFromRaw) {
    const date = new Date(validFromRaw);
    date.setHours(0, 0, 0, 0);
    if (date.getTime() === today.getTime() || date.getTime() === tomorrow.getTime()) {
      return {
        label: "NEW",
        style: {
          background: "linear-gradient(135deg, #0891B2, #06B6D4)",
          color: "#fff",
          padding: "4px 10px",
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          boxShadow: "0 8px 20px rgba(6,182,212,0.26)",
        },
      };
    }
  }

  return null;
};
