package com.rupee.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.DayOfWeek;
import java.time.LocalTime;

@Entity
@Table(name = "business_hours")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class BusinessHours {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "day_of_week", nullable = false, unique = true)
    private DayOfWeek dayOfWeek; // e.g., MONDAY, TUESDAY

    @Column(name = "start_time")
    private LocalTime startTime; // e.g., 09:00

    @Column(name = "end_time")
    private LocalTime endTime; // e.g., 17:00

    @Column(name = "is_working_day", nullable = false)
    private boolean isWorkingDay = true;
}