import logoImg from "../assests/MeetMastersMLogo.png";
import { apiFetch } from "./api";

export interface RazorpayCheckoutResult {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayOrderCheckoutRequest {
  keyId?: string;
  orderId: string;
  amount: number;
  description: string;
  notes?: Record<string, string | number | boolean | null | undefined>;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
}

type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", cb: (response: any) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, any>) => RazorpayInstance;
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let checkoutScriptPromise: Promise<void> | null = null;

const loadRazorpayCheckout = () => {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;

  checkoutScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Razorpay Checkout.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout."));
    document.body.appendChild(script);
  });

  return checkoutScriptPromise;
};

const toPaise = (amount: number) => Math.round(Number(amount || 0) * 100);

const getCheckoutImageUrl = () => {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return undefined;
  if (window.location.protocol !== "https:") return undefined;
  return new URL(logoImg, window.location.origin).href;
};

export const openRazorpayOrder = async (
  request: RazorpayOrderCheckoutRequest
): Promise<RazorpayCheckoutResult> => {
  await loadRazorpayCheckout();

  const Razorpay = window.Razorpay;
  const key = request.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID || import.meta.env.VITE_RAZORPAY_KEY;

  if (!Razorpay) throw new Error("Razorpay Checkout is unavailable.");
  if (!request.orderId) throw new Error("Razorpay order id is missing.");
  if (!key) throw new Error("Razorpay key id is missing. Set VITE_RAZORPAY_KEY_ID in .env.");

  return new Promise<RazorpayCheckoutResult>((resolve, reject) => {
    const checkoutImage = getCheckoutImageUrl();
    const checkoutOptions: Record<string, any> = {
      key,
      amount: toPaise(request.amount),
      currency: "INR",
      name: "Meet The Masters",
      description: request.description,
      order_id: request.orderId,
      prefill: request.prefill || {},
      notes: request.notes || {},
      theme: {
        color: "#2563EB",
      },
      modal: {
        ondismiss: () => reject(new Error("Payment cancelled.")),
      },
      handler: (response: RazorpayCheckoutResult) => resolve(response),
    };
    if (checkoutImage) checkoutOptions.image = checkoutImage;

    const checkout = new Razorpay(checkoutOptions);

    checkout.on("payment.failed", (response: any) => {
      reject(new Error(response?.error?.description || "Payment failed. Please try again."));
    });

    checkout.open();
  });
};

const verifyPayment = async (
  endpoint: string,
  response: RazorpayCheckoutResult
) => {
  const params = new URLSearchParams({
    razorpayPaymentId: response.razorpay_payment_id,
    razorpayOrderId: response.razorpay_order_id,
    razorpaySignature: response.razorpay_signature,
  });

  return apiFetch(`${endpoint}?${params.toString()}`, { method: "POST" });
};

export const verifyBookingPayment = async (
  bookingId: number,
  response: RazorpayCheckoutResult
) => verifyPayment(`/bookings/${bookingId}/verify-payment`, response);

export const verifySpecialBookingPayment = async (
  specialBookingId: number,
  response: RazorpayCheckoutResult
) => verifyPayment(`/special-bookings/${specialBookingId}/verify-payment`, response);
