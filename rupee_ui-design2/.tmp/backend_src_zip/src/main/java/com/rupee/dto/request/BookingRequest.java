package com.rupee.dto.request;

import com.rupee.enums.BookingEnums.MeetingMode;
import jakarta.validation.constraints.Size;
import lombok.Data;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

@Data
public class BookingRequest {
    @NotNull(message = "Consultant ID is required")
    private Long consultantId;

    @NotNull(message = "Time Slot ID is required")
    private Long timeSlotId;

    // ✅ CHANGED: Explicitly asking for the base amount
    @NotNull(message = "Base amount is required")
    private BigDecimal baseAmount;

    private Long offerId; // ✅ Add this field

    @NotNull(message = "Meeting Mode is required")
    private MeetingMode meetingMode;

    @Size(max = 500, message = "Notes cannot exceed 500 characters")
    private String userNotes;
}