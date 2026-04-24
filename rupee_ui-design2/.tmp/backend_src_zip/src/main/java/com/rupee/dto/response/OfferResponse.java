package com.rupee.dto.response;

import com.fasterxml.jackson.annotation.JsonFormat; // ✅ ADD THIS IMPORT
import com.rupee.enums.OfferStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OfferResponse {
    private Long id;
    private String title;
    private String description;
    private String discount;

    // ✅ Prevents 500 Internal Server Error during GET requests
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime validFrom;

    // ✅ Prevents 500 Internal Server Error during GET requests
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime validTo;

    private boolean isActive;
    private Long consultantId;
    private OfferStatus status;
}