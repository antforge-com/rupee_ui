package com.rupee.enums;

public class BookingEnums {

    public enum BookingStatus {
        PENDING,     // User clicked 'Book Now' but hasn't paid
        CONFIRMED,   // Payment successful, slot is locked
        COMPLETED,   // Consultation happened
        CANCELLED    // Cancelled by user or consultant
    }

    public enum PaymentStatus {
        PENDING,
        SUCCESS,
        FAILED,
        REFUNDED
    }

    // ✅ Added Meeting Mode
    public enum MeetingMode {
        PHYSICAL,
        ONLINE,
        PHONE
    }
}