package com.rupee.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import java.util.List;

@Data
public class BulkTimeSlotRequest {
    @NotEmpty(message = "Time slots list cannot be empty")
    private List<@Valid TimeSlotRequest> timeSlots;
}