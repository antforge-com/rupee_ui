package com.rupee.entity;

import com.rupee.enums.TicketEnums.Priority;
import com.rupee.enums.TicketEnums.Status;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Represents a Customer Support Ticket in the system.
 * Includes tracking for SLA compliance, escalations, and customer feedback.
 */
@Entity
@Table(name = "tickets", indexes = {
        // 1. Core User Pagination (Speeds up getTicketsByUser sorted by date)
        @Index(name = "idx_ticket_user", columnList = "user_id, created_at"),

        // 2. Core Consultant Pagination (Speeds up getTicketsByConsultant sorted by date)
        @Index(name = "idx_ticket_consultant", columnList = "consultant_id, created_at"),

        // 3. Admin Analytics Engine (Drives 80% of Dashboard APIs: Volume, Performance, SLA reports)
        @Index(name = "idx_ticket_created_at", columnList = "created_at"),

        // 4. Background SLA Cron Job (Prevents the 5-minute schedule from locking the DB)
        @Index(name = "idx_ticket_sla_cron", columnList = "is_sla_breached, status, sla_resolve_by")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Ticket {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Human-readable custom Ticket ID (e.g., 05/25/1)
    @Column(name = "ticket_number", unique = true, length = 20)
    private String ticketNumber;

    // The ID of the customer who created the ticket
    @Column(name = "user_id", nullable = false)
    private Long userId;

    // The ID of the support agent assigned to resolve the ticket
    @Column(name = "consultant_id")
    private Long consultantId;

    // High-level grouping (e.g., "Billing", "Technical Support")
    @Column(name = "category", nullable = false, length = 50)
    private String category;

    // The main issue described by the customer
    @Column(name = "description", nullable = false, length = 2000)
    private String description;

    // Optional file/image uploaded by the customer for context
    @Column(name = "attachment_url", length = 500)
    private String attachmentUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Priority priority = Priority.MEDIUM;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.NEW;

    // --- SLA COMPLIANCE ---

    // The deadline for the assigned consultant to send their first reply
    @Column(name = "sla_respond_by")
    private LocalDateTime slaRespondBy;

    // The deadline for the ticket to be completely resolved/closed
    @Column(name = "sla_resolve_by")
    private LocalDateTime slaResolveBy;

    // Flag triggered automatically if either SLA deadline is missed
    @Column(name = "is_sla_breached", nullable = false)
    private boolean isSlaBreached = false;

    // Tracks the exact moment the consultant first replies
    @Column(name = "first_responded_at")
    private LocalDateTime firstRespondedAt;

    // --- ESCALATION TRACKING ---

    // True if the ticket was manually escalated or auto-escalated due to an SLA breach
    @Column(name = "is_escalated", nullable = false)
    private boolean isEscalated = false;

    // The exact time the escalation occurred
    @Column(name = "escalated_at")
    private LocalDateTime escalatedAt;

    // The reason provided by the user/system for the escalation (e.g., "SYSTEM AUTO-ESCALATION")
    @Column(name = "escalation_reason", length = 1000)
    private String escalationReason;

    // --- CUSTOMER FEEDBACK ---

    // A 1 to 5 star rating left by the customer after the ticket is resolved
    @Column(name = "feedback_rating")
    private Integer feedbackRating;

    // Optional written review left by the customer
    @Column(name = "feedback_text", length = 1000)
    private String feedbackText;

    // --- RESOLUTION TIMESTAMPS ---
    // FIX: These fields are critical for accurate analytics (resolution time, SLA compliance).
    // Previously missing — updatedAt was used as a proxy, which broke calculations
    // because updatedAt changes on every edit (comments, priority changes, etc.).

    /**
     * Set when status transitions to RESOLVED.
     * Used by the analytics module to compute actual resolution time.
     */
    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    /**
     * Set when status transitions to CLOSED (after feedback or manual close).
     * Used by the analytics module to compute SLA compliance per closed ticket.
     */
    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    // --- AUDIT TIMESTAMPS ---

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
