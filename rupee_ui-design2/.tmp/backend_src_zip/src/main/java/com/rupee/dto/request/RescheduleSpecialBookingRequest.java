package com.rupee.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalTime;

@Data
public class RescheduleSpecialBookingRequest {
    @NotNull(message = "New Date is required")
    private LocalDate newDate;

    @NotNull(message = "New Time is required")
    private LocalTime newTime;
}