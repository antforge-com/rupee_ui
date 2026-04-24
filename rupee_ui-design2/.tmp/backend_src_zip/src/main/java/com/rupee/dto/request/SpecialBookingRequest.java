package com.rupee.dto.request;

import com.rupee.enums.BookingEnums.MeetingMode;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;
import java.math.BigDecimal;

@Data
public class SpecialBookingRequest {
    @NotNull(message = "Consultant ID is required")
    private Long consultantId;

    @Min(value = 1, message = "Duration must be at least 1 hour")
    private int durationInHours; // Represents 1, 2, or 3 hours as a single continuous block

    @NotNull(message = "Meeting Mode is required")
    private MeetingMode meetingMode;

    private Long offerId;

    @NotNull(message = "Session amount is required")
    @Positive(message = "Session amount must be positive")
    private BigDecimal sessionAmount; // Flat fee for the entire session!

    @NotNull(message = "User notes is required")
    private String userNotes;
}