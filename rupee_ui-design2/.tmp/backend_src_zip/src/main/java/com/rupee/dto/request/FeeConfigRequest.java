package com.rupee.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class FeeConfigRequest {
    @NotBlank(message = "Fee type is required (FLAT or PERCENTAGE)")
    private String feeType;

    @NotBlank(message = "Fee value is required")
    private String feeValue;
}