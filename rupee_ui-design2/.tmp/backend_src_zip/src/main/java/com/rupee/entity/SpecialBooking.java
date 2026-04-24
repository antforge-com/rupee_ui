package com.rupee.entity;

import com.rupee.enums.BookingEnums.MeetingMode;
import com.rupee.enums.BookingEnums.PaymentStatus;
import com.rupee.enums.SpecialBookingStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.LocalDateTime;

@Entity
@Table(name = "special_bookings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SpecialBooking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    // ✅ FIXED: Changed to durationInHours to match the new architecture
    @Column(name = "duration_in_hours", nullable = false)
    private Integer durationInHours;

    // ✅ Filled by Consultant later
    @Column(name = "scheduled_date")
    private LocalDate scheduledDate;

    // ✅ Filled by Consultant later
    @Column(name = "scheduled_time")
    private LocalTime scheduledTime;

    @Column(name = "meeting_id")
    private String meetingId;

    @Column(name = "meeting_link")
    private String meetingLink;

    // --- Financial Fields (User pays upfront flat session fee) ---
    @Column(name = "offer_id")
    private Long offerId;

    @Column(name = "base_amount")
    private BigDecimal baseAmount;

    @Column(name = "discount_amount")
    private BigDecimal discountAmount;

    @Column(name = "additional_charges")
    private BigDecimal additionalCharges;

    @Column(name = "total_amount")
    private BigDecimal totalAmount;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private SpecialBookingStatus status = SpecialBookingStatus.REQUESTED;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "payment_status", nullable = false)
    private PaymentStatus paymentStatus = PaymentStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(name = "meeting_mode", nullable = false)
    private MeetingMode meetingMode;

    @Column(name = "user_notes", length = 1000, nullable = false)
    private String userNotes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}