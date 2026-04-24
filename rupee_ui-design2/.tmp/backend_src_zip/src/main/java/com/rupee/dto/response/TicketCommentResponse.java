package com.rupee.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TicketCommentResponse {
    private Long id;
    private Long ticketId;
    private Long senderId;
    private boolean isConsultantReply;
    private String message;
    private LocalDateTime createdAt;
}