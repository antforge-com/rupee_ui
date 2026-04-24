package com.rupee.dto.request;

import com.rupee.enums.BookingEnums.MeetingMode;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class BulkBookingRequest {
    @NotNull(message = "Consultant ID is required")
    private Long consultantId;

    // ✅ Now allows 2 to 4 slots
    @NotNull(message = "Time Slot IDs are required")
    @Size(min = 2, max = 4, message = "You must select between 2 and 4 slots for a bulk booking")
    private List<Long> timeSlotIds;

    // ✅ Renamed for clarity
    @NotNull(message = "Base amount per slot is required")
    private BigDecimal baseAmountPerSlot;

    private Long offerId;

    @NotNull(message = "Meeting Mode is required")
    private MeetingMode meetingMode;

    @Size(max = 500, message = "Notes cannot exceed 500 characters")
    private String userNotes;
}