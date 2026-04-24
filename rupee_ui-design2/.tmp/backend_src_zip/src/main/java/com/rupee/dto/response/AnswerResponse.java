package com.rupee.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AnswerResponse {
    private Long id;
    private Long bookingId; // ✅ Included so the frontend knows exactly where this belongs
    private String bookingType; // ✅ NEW: Crucial for differentiating Normal vs. Special
    private Long questionId;
    private String text;
    private LocalDateTime updatedAt;
    private boolean isActive;

    // ✅ Updated custom constructor
    public AnswerResponse(Long id, Long bookingId, String bookingType, Long questionId, String text, LocalDateTime updatedAt) {
        this.id = id;
        this.bookingId = bookingId;
        this.bookingType = bookingType;
        this.questionId = questionId;
        this.text = text;
        this.updatedAt = updatedAt;
        this.isActive = true;
    }
}