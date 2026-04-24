package com.rupee.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "consultant_special_days",
        uniqueConstraints = {
                // ✅ Guaranteed database-level protection against duplicates
                @UniqueConstraint(name = "uk_consultant_date", columnNames = {"consultant_id", "special_date"})
        },
        indexes = {
                // ✅ Excellent addition for fast lookups
                @Index(name = "idx_special_day_consultant", columnList = "consultant_id")
        }
)
@Getter
@Setter
@Builder // ✅ ADDED THIS
@NoArgsConstructor
@AllArgsConstructor
public class ConsultantSpecialDay {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "special_date", nullable = false)
    private LocalDate specialDate;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}