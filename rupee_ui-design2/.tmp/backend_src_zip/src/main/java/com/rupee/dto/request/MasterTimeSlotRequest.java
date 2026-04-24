package com.rupee.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class MasterTimeSlotRequest {
    @NotBlank(message = "Time range is required")
    @Size(max = 50, message = "Time range cannot exceed 50 characters")
    private String timeRange;

    @NotNull(message = "Duration is required")
    private Integer duration;
}