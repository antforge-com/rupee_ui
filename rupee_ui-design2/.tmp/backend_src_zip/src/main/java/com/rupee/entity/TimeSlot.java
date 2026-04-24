package com.rupee.entity;

import com.rupee.enums.TimeSlotEnums.SlotStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "time_slots")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TimeSlot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "slot_date", nullable = false)
    private LocalDate slotDate;

    // ✅ Replaced slotTime with Master lookup ID
    @Column(name = "master_time_slot_id", nullable = false)
    private Long masterTimeSlotId;

    // ✅ ADDED THIS: Maps to the missing DB column to fix the 500 error!
    @Column(name = "duration_minutes", nullable = false)
    private Integer durationMinutes;

    // ✅ Replaced isBooked with specific SlotStatus
    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private SlotStatus status = SlotStatus.AVAILABLE;

    @Version
    private Long version;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}