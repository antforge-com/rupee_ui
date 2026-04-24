package com.rupee.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TicketCommentRequest {
    @NotNull(message = "Ticket ID is required")
    private Long ticketId;

    @NotNull(message = "Sender ID is required")
    private Long senderId;

    @NotNull(message = "Must specify if reply is from a consultant")
    private Boolean isConsultantReply;

    @NotBlank(message = "Message cannot be empty")
    @Size(max = 1000, message = "Message cannot exceed 1000 characters")
    private String message;
}