package com.rupee.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class QuestionRequest {

    @NotBlank(message = "Question text cannot be blank")
    private String text;

    // ✅ NEW FIELDS
    private String type;
    private String options;
    private String placeholder;
}