package com.rupee.dto.request;

import com.fasterxml.jackson.annotation.JsonFormat; // ✅ ADD THIS IMPORT
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class OfferRequest {
    @NotBlank(message = "Title is required")
    private String title;

    private String description;

    @NotBlank(message = "Discount string is required (e.g., '20%' or '500')")
    private String discount;

    @NotNull(message = "Valid From date is required")
    // ✅ Force Jackson to accept standard ISO date-times (or append T00:00:00 in frontend)
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime validFrom;

    @NotNull(message = "Valid To date is required")
    // ✅ Force Jackson to accept standard ISO date-times
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime validTo;

    private boolean isActive;

    // Can be null if created by Admin for global use
    private Long consultantId;
}