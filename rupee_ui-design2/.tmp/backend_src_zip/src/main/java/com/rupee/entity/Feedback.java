package com.rupee.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "feedbacks")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Feedback {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Loose coupling: Storing only the reference ID instead of the User entity
    @Column(name = "user_id", nullable = false)
    private Long userId;

    // Loose coupling: Storing only the reference ID instead of the Consultant entity
    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    // Loose coupling: Storing only the reference ID for the Meeting
    @Column(name = "meeting_id", nullable = false)
    private Long meetingId;

    // Loose coupling: Storing only the reference ID for the Booking
    @Column(name = "booking_id", nullable = false)
    private Long bookingId;

    @Column(nullable = false)
    private Integer rating; // Assuming a 1-5 or 1-10 scale

    @Column(length = 1000)
    private String comments;

    // ==========================================
    // ✅ ADD THIS FOR ANALYTICS FILTERING
    // ==========================================
    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}