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
public class TicketNoteResponse {
    private Long id;
    private Long ticketId;
    private Long authorId;
    private String noteText;
    private LocalDateTime createdAt;
}