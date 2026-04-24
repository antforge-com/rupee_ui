package com.rupee.dto.response;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class StaticContentResponse {
    private Long contentId;
    private String contentType;
    private String content;
    private LocalDateTime lastUpdatedDate;
    private String lastUpdatedBy;
}