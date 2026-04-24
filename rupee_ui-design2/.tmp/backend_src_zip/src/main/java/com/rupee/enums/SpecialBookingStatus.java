package com.rupee.enums;

public enum SpecialBookingStatus {
    REQUESTED,   // User paid, waiting for consultant to give slot
    CONFIRMED,   // Consultant gave the date/time/link
    CANCELLED,
    COMPLETED
}