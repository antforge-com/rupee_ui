package com.rupee.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class QuestionResponse {
    private Long id;
    private String text;
    private String type;         // ✅ NEW
    private String options;      // ✅ NEW
    private String placeholder;  // ✅ NEW
    private LocalDateTime updatedAt;
    private boolean isActive;

    // Updated constructor to map the new fields
    public QuestionResponse(Long id, String text, String type, String options, String placeholder, LocalDateTime updatedAt) {
        this.id = id;
        this.text = text;
        this.type = type;
        this.options = options;
        this.placeholder = placeholder;
        this.updatedAt = updatedAt;
        this.isActive = true;
    }
}