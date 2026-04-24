package com.rupee.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "static_contents")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class StaticContent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "content_id")
    private Long contentId;

    // e.g., "PRIVACY_POLICY", "TERMS_AND_CONDITIONS", "ABOUT_US"
    @Column(name = "content_type", nullable = false, unique = true, length = 100)
    private String contentType;

    // Uses TEXT to store large HTML strings without truncation errors
    @Column(name = "content", columnDefinition = "TEXT", nullable = false)
    private String content;

    @UpdateTimestamp
    @Column(name = "last_updated_date")
    private LocalDateTime lastUpdatedDate;

    // Stores the ID or Username of the admin who made the change
    @Column(name = "last_updated_by")
    private String lastUpdatedBy;
}