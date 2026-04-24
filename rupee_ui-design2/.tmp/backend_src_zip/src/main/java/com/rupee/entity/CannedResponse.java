package com.rupee.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "canned_responses")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class CannedResponse {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String title; // e.g., "Refund Policy", "Greeting"

    @Column(nullable = false, length = 2000)
    private String content; // The actual pre-written text

    @Column(length = 50)
    private String category; // Optional: To filter responses by ticket category

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}