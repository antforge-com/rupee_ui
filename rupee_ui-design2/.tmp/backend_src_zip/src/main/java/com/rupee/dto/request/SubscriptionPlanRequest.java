package com.rupee.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.Data;
import java.math.BigDecimal;

@Data
public class SubscriptionPlanRequest {

    @NotBlank(message = "Plan name is required")
    @Size(max = 50, message = "Plan name cannot exceed 50 characters")
    private String name;

    @NotNull(message = "Original price is required")
    @PositiveOrZero(message = "Original price cannot be negative")
    private BigDecimal originalPrice;

    @NotNull(message = "Discount price is required")
    @PositiveOrZero(message = "Discount price cannot be negative")
    private BigDecimal discountPrice;

    @Size(max = 255, message = "Features description cannot exceed 255 characters")
    private String features;

    @Size(max = 50, message = "Tag cannot exceed 50 characters")
    private String tag;
}