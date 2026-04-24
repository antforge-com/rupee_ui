package com.rupee.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class StaticContentRequest {
    @NotBlank(message = "Content Type is required (e.g., PRIVACY_POLICY)")
    private String contentType;

    @NotBlank(message = "HTML Content is required")
    private String content;

    private String lastUpdatedBy;
}