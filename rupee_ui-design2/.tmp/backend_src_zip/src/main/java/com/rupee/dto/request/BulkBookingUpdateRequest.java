package com.rupee.dto.request;

import com.rupee.enums.BookingEnums.BookingStatus;
import com.rupee.enums.BookingEnums.MeetingMode;
import com.rupee.enums.BookingEnums.PaymentStatus;
import lombok.Data;
import java.util.List;

@Data
public class BulkBookingUpdateRequest {
    private BookingStatus bookingStatus;
    private PaymentStatus paymentStatus;

    // ✅ For reassigning the entire block of slots
    private Long consultantId;
    private List<Long> timeSlotIds;

    private MeetingMode meetingMode;
    private String meetingLink;
    private String meetingId;
    private String meetingNotes;
}