package com.rupee.entity;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

@Entity
@Table(name = "consultants")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Consultant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 100)
    private String designation; // e.g., "Certified Financial Planner"

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal charges; // e.g., 1500.00

    @Column(name = "shift_start_time")
    private LocalTime shiftStartTime;

    @Column(name = "shift_end_time")
    private LocalTime shiftEndTime;

    @Column(name = "profile_photo")
    private String profilePhoto;

    @Column(length = 2000)
    private String description;

    @Column(nullable = false)
    private Double rating = 5.0; // Default rating

    @Column(name = "years_of_experience")
    private Double yearsOfExperience;

    // ✅ NEW: Slot Duration Fields
    @Column(name = "slots_duration")
    private Integer slotsDuration = 60;

    @Column(name = "last_duration_update")
    private LocalDate lastDurationUpdate;
}