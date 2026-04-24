package com.rupee.dto.request;

import com.rupee.enums.BookingEnums.BookingStatus;
import com.rupee.enums.BookingEnums.MeetingMode;
import com.rupee.enums.BookingEnums.PaymentStatus;
import lombok.Data;

@Data
public class BookingUpdateRequest {
    private BookingStatus bookingStatus;
    private PaymentStatus paymentStatus;

    // ✅ ADDED: Needed for Admin to reassign the booking
    private Long consultantId;
    private Long timeSlotId;

    // Allow consultant to change the meeting mode if needed
    private MeetingMode meetingMode;

    // Consultant updates these:
    private String meetingLink;
    private String meetingId;
    private String meetingNotes;
}