package com.rupee.dto.response;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Map;

@Data
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class ValidationErrorResponse extends ErrorResponse {
    private Map<String, String> fieldErrors;

    public ValidationErrorResponse(int status, String error, String message, LocalDateTime timestamp, Map<String, String> fieldErrors) {
        super(status, error, message, timestamp, null);
        this.fieldErrors = fieldErrors;
    }
}