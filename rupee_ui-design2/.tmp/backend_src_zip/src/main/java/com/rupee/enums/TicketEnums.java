package com.rupee.enums;

public class TicketEnums {

    public enum Priority {
        LOW,
        MEDIUM,
        HIGH,
        URGENT,   // ADDED URGENT
        CRITICAL
    }

    public enum Status {
        NEW,
        OPEN,
        IN_PROGRESS, // Added to match the frontend UI button
        PENDING,     // (Optional) You can keep or delete this depending on if the UI uses it
        RESOLVED,
        CLOSED
    }
}