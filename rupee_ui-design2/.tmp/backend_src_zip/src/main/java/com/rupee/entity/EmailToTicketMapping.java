package com.rupee.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Maps incoming emails to automatically created tickets.
 * Used to track email processing and prevent duplicate ticket creation.
 */
@Entity
@Table(name = "email_to_ticket_mapping", indexes = {
    @Index(name = "idx_email_msg_id", columnList = "email_message_id"),
    @Index(name = "idx_sender_email", columnList = "sender_email"),
    @Index(name = "idx_ticket_id", columnList = "ticket_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class EmailToTicketMapping {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "ticket_id", nullable = false)
    private Long ticketId;

    // Unique email message ID (usually Message-ID header from email)
    @Column(name = "email_message_id", nullable = false, unique = true, length = 500)
    private String emailMessageId;

    // Original sender's email address
    @Column(name = "sender_email", length = 255)
    private String senderEmail;

    // Email subject line (for reference)
    @Column(name = "subject", length = 500)
    private String subject;

    // When the email was received by the server
    @Column(name = "received_at", nullable = false)
    private LocalDateTime receivedAt;

    // When the email was processed and ticket created
    @Column(name = "processed_at", nullable = false)
    private LocalDateTime processedAt;

    // JSON array of attachment URLs from the email
    @Column(name = "attachment_urls", columnDefinition = "TEXT")
    private String attachmentUrls;

    // Audit timestamp
    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}

