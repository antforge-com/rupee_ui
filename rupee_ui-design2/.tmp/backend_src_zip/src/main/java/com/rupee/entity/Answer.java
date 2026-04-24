package com.rupee.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "answers", indexes = {
        @Index(name = "idx_answer_user_id", columnList = "user_id"),
        @Index(name = "idx_answer_booking_lookup", columnList = "booking_id, booking_type") // ✅ UPDATED INDEX
})
@Getter
@Setter
public class Answer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "booking_id", nullable = false)
    private Long bookingId;

    // ✅ NEW: Tells us if bookingId belongs to 'NORMAL' or 'SPECIAL' table
    @Column(name = "booking_type", nullable = false, length = 20)
    private String bookingType;

    @Column(name = "question_id", nullable = false)
    private Long questionId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String text;

    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}