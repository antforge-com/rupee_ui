package com.rupee.dto.request;

import com.rupee.enums.TicketEnums.Priority;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Request DTO for converting an email to a ticket.
 * Used internally by EmailToTicketService to pass data to TicketService.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class EmailToTicketRequest {

    @NotBlank(message = "Sender email is required")
    private String senderEmail;

    @NotBlank(message = "Email subject is required")
    private String emailSubject;

    @NotBlank(message = "Email body is required")
    private String emailBody;

    // Email metadata
    private String emailMessageId;

    private Long receivedTimestamp;
    private String attachmentUrls; // JSON array

    // Extracted ticket fields
    private String category; // Auto-detected or "Other"
    private Priority priority; // Auto-detected or MEDIUM
    private Long userId; // Resolved from senderEmail or created as new user
}

