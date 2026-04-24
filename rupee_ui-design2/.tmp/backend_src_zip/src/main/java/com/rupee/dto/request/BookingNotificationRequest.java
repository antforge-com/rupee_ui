package com.rupee.dto.request;

import lombok.Data;

@Data
public class BookingNotificationRequest {
    private Long bookingId;
    private String slotDate;
    private String timeRange;
    private String meetingMode;
    private String meetingLink; // Renamed and added
    private String userName;
    private String userEmail;
    private String consultantName;
    private String consultantEmail;
    private String amount;
    private String discountAmount; // ✅ ADD THIS LINE
    private String userNotes;
}