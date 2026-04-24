package com.rupee.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "master_time_slots", indexes = {
        @Index(name = "idx_master_time_range", columnList = "time_range")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MasterTimeSlot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // e.g., "10:00 AM - 11:00 AM"
    @Column(name = "time_range", nullable = false, unique = true, length = 50)
    private String timeRange;

    // Duration for mapping
    // Added @Builder.Default to ensure the builder respects the "60"
    @Builder.Default
    @Column(name = "duration", nullable = false)
    private Integer duration = 60;
}