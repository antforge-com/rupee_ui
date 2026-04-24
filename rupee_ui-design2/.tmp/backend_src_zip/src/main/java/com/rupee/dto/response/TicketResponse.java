package com.rupee.dto.response;

import com.rupee.enums.TicketEnums.Priority;
import com.rupee.enums.TicketEnums.Status;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TicketResponse {
    private Long id;

    private String ticketNumber;

    private Long userId;
    private Long consultantId;
    private String category;
    private String description;
    private String attachmentUrl;
    private Priority priority;
    private Status status;

    // --- SLA COMPLIANCE ---
    private LocalDateTime slaRespondBy;
    private LocalDateTime slaResolveBy;
    private boolean isSlaBreached;

    // FIX: Renamed from firstRespondedAt → firstResponseAt to match what the
    // analytics frontend expects. The DTO_SELECT query maps t.firstRespondedAt here.
    private LocalDateTime firstResponseAt;

    // --- ESCALATION TRACKING ---
    private boolean isEscalated;
    private LocalDateTime escalatedAt;
    private String escalationReason;

    // --- FEEDBACK ---
    private Integer feedbackRating;
    private String feedbackText;

    // --- TIMESTAMPS ---
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // FIX: Added resolvedAt — set when status → RESOLVED. Analytics uses this
    // to compute accurate resolution times instead of relying on updatedAt.
    private LocalDateTime resolvedAt;

    // FIX: Added closedAt — set when status → CLOSED. Needed for SLA compliance
    // calculations on fully closed tickets.
    private LocalDateTime closedAt;

    // FIX: Added consultantName — populated by the analytics service via a
    // Consultant lookup. Without this the Agent Performance module shows every
    // ticket as "Unassigned" because the frontend cannot resolve the name from
    // consultantId alone.
    private String consultantName;
}
