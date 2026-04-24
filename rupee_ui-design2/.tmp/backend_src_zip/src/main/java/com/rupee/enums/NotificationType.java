package com.rupee.enums;

public enum NotificationType {
    NEW_TICKET,      // <--- Make sure this is here!
    TICKET_UPDATED,
    NEW_ASSIGNMENT,
    ESCALATION,
    NEW_BOOKING,     // Used when User creates/pays for the request
    BOOKING_UPDATED  // Used when Consultant gives the slot
}