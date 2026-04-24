package com.rupee.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.util.List;

@Data
public class AnswerSubmissionRequest {

    @NotNull(message = "Booking ID is required")
    private Long bookingId;

    // ✅ NEW: Frontend must send "NORMAL" or "SPECIAL"
    @NotBlank(message = "Booking Type (NORMAL or SPECIAL) is required")
    private String bookingType;

    private Long consultantId;

    @NotEmpty(message = "Answers list cannot be empty")
    @Valid
    private List<AnswerItem> answers;

    @Data
    public static class AnswerItem {
        @NotNull(message = "Question ID is required")
        private Long questionId;

        @NotBlank(message = "Answer cannot be blank")
        private String text;
    }
}