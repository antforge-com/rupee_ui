package com.rupee.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "questions")
@Getter
@Setter
public class Question {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Removed nullable = false so new standalone questions can be created
    @Column(name = "skill_id")
    private Long skillId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String text;

    // ✅ NEW: Frontend dynamic form fields
    @Column(length = 32)
    private String type = "radio"; // Defaults to radio as requested

    @Column(columnDefinition = "TEXT")
    private String options;

    @Column(length = 512)
    private String placeholder;

    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}