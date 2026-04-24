package com.rupee.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TicketEscalationRequest {
    @NotBlank(message = "Escalation reason is required")
    private String reason;
}