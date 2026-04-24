package com.rupee.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class RescheduleBulkBookingRequest {
    @NotNull(message = "Old Time Slot ID is required")
    private Long oldTimeSlotId;

    @NotNull(message = "New Time Slot ID is required")
    private Long newTimeSlotId;
}