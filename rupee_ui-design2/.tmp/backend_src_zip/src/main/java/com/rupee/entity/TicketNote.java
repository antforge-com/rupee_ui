package com.rupee.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "ticket_notes", indexes = {
        @Index(name = "idx_note_ticket", columnList = "ticket_id, created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TicketNote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "ticket_id", nullable = false)
    private Long ticketId;

    @Column(name = "author_id", nullable = false)
    private Long authorId; // ID of the agent/admin who wrote the note

    @Column(name = "note_text", nullable = false, length = 2000)
    private String noteText;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}