package com.rupee.dto.response;

import com.rupee.enums.TimeSlotEnums.SlotStatus;
import lombok.Builder;
import lombok.Data;
import java.time.LocalDate;

@Data
@Builder
public class TimeSlotResponse {
    private Long id;
    private Long consultantId;
    private LocalDate slotDate;

    // ✅ Updated Fields
    private Long masterTimeSlotId;
    private String timeRange; // Frontend needs the actual string (e.g., "10 AM - 11 AM")

    // ✅ ADDED THIS! So the frontend gets the duration back when they fetch slots
    private Integer durationMinutes;

    private SlotStatus status;

    private Long version; // Useful for the frontend to know the current state
}