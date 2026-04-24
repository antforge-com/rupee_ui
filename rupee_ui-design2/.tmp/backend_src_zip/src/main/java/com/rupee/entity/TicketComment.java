package com.rupee.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "ticket_comments", indexes = {
        @Index(name = "idx_comment_ticket", columnList = "ticket_id, created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TicketComment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "ticket_id", nullable = false)
    private Long ticketId;

    @Column(name = "sender_id", nullable = false)
    private Long senderId;

    @Column(name = "is_consultant_reply", nullable = false)
    private boolean isConsultantReply;

    @Column(nullable = false, length = 1000)
    private String message;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}