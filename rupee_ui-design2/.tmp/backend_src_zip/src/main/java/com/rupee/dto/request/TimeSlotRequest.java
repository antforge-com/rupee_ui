package com.rupee.dto.request;

import com.rupee.enums.TimeSlotEnums.SlotStatus;
import lombok.Data;
import java.time.LocalDate;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive; // ✅ Added import

@Data
public class TimeSlotRequest {
    @NotNull(message = "Consultant ID is required")
    private Long consultantId;

    @NotNull(message = "Slot Date is required")
    private LocalDate slotDate;

    @NotNull(message = "Master Time Slot ID is required")
    private Long masterTimeSlotId;

    // ✅ ADDED THIS! This will catch the '60' and stop the 500 Internal Server Error
    @NotNull(message = "Duration is required")
    @Positive(message = "Duration must be positive")
    private Integer durationMinutes;

    // Optional: Consultant can manually set it to UNAVAILABLE when creating
    private SlotStatus status;
}