// ─────────────────────────────────────────────────────────────────────────────
// Booking Enums (matching backend: BookingEnums.java)
// ─────────────────────────────────────────────────────────────────────────────

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
export type MeetingMode = 'PHYSICAL' | 'ONLINE' | 'PHONE';
export type SpecialBookingStatus = 'REQUESTED' | 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

// ─────────────────────────────────────────────────────────────────────────────
// Normal Booking Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeSlotData {
  id: number;
  date: string;
  time: string;
  duration?: number;
  status: string;
}

export interface BookingRequest {
  consultantId: number;
  timeSlotId: number;
  baseAmount: number;
  meetingMode: MeetingMode;
  userNotes?: string;
  offerId?: number;
}

export interface BulkBookingRequest {
  consultantId: number;
  timeSlotIds: number[];
  baseAmountPerSlot: number;
  meetingMode: MeetingMode;
  userNotes?: string;
  offerId?: number;
}

export interface BookingResponse {
  id: number;
  userId: number;
  consultantId: number;
  timeSlotIds: number[];
  discountAmount?: number;
  totalAmount?: number;
  offerId?: number;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  meetingMode: MeetingMode;
  meetingLink?: string;
  meetingId?: string;
  meetingNotes?: string;
  userNotes?: string;
  version?: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BulkBookingResponse {
  bookingId: number;
  timeSlotIds: number[];
  message: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
}

export interface BookingUpdateRequest {
  bookingStatus?: BookingStatus;
  paymentStatus?: PaymentStatus;
  timeSlotId?: number;
  consultantId?: number;
  meetingMode?: MeetingMode;
  meetingLink?: string;
  meetingId?: string;
  meetingNotes?: string;
}

export interface RescheduleBookingRequest {
  newTimeSlotId: number;
}

export interface BulkBookingUpdateRequest {
  bookingStatus?: BookingStatus;
  paymentStatus?: PaymentStatus;
  timeSlotIds?: number[];
  consultantId?: number;
  meetingMode?: MeetingMode;
  meetingLink?: string;
  meetingId?: string;
  meetingNotes?: string;
}

export interface RescheduleBulkBookingRequest {
  oldTimeSlotId: number;
  newTimeSlotId: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Special Booking Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface SpecialBookingRequest {
  consultantId: number;
  durationInHours: number;
  sessionAmount: number;
  meetingMode: MeetingMode;
  userNotes?: string;
  offerId?: number;
}

export interface SpecialBookingResponse {
  id: number;
  userId: number;
  consultantId: number;
  durationInHours: number;
  scheduledDate?: string;
  scheduledTime?: string;
  meetingId?: string;
  meetingLink?: string;
  meetingMode: MeetingMode;
  userNotes?: string;
  offerId?: number;
  discountAmount?: number;
  totalAmount?: number;
  status: SpecialBookingStatus;
  paymentStatus: PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GiveSlotRequest {
  date: string;
  startTime: string;
  meetingLink?: string;
  meetingId?: string;
}

export interface RescheduleSpecialBookingRequest {
  newDate: string;
  newTime: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Razorpay Payment Integration
// ─────────────────────────────────────────────────────────────────────────────

export interface RazorpayVerificationRequest {
  bookingId?: number;
  specialBookingId?: number;
  razorpayPaymentId: string;
  razorpayOrderId: string;
  razorpaySignature: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination Helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  size?: number;
}

export interface PagedResponse<T> {
  content: T[];
  totalElements?: number;
  totalPages?: number;
  currentPage?: number;
  pageSize?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Summary
// ─────────────────────────────────────────────────────────────────────────────

export interface BookingSummary {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  revenue?: number;
}

export interface RevenueAnalytics {
  totalBookings: number;
  completed: number;
  totalRevenue: number;
  tableData: Array<{
    consultantId: number;
    bookings: number;
    completed: number;
    revenue: number;
  }>;
}

