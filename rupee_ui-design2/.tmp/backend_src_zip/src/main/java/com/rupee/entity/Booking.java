package com.rupee.entity;

import com.rupee.enums.BookingEnums.BookingStatus;
import com.rupee.enums.BookingEnums.MeetingMode;
import com.rupee.enums.BookingEnums.PaymentStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "bookings", indexes = {
        @Index(name = "idx_user_id_only", columnList = "user_id, id"),
        @Index(name = "idx_consultant_id_only", columnList = "consultant_id, id"),
        @Index(name = "idx_booking_status", columnList = "booking_status, id"),
        @Index(name = "idx_booking_created_at", columnList = "created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Booking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    // ✅ THE FIX: Extremely loose coupling.
    // Stores a single ID for normal bookings ("105")
    // or comma-separated IDs for bulk bookings ("105,106,107")
    @Column(name = "time_slot_ids", nullable = false)
    private String timeSlotIds;

    @Column(name = "offer_id")
    private Long offerId;

    @Column(name = "base_amount", nullable = false)
    private BigDecimal baseAmount;

    @Column(name = "additional_charges", nullable = false)
    private BigDecimal additionalCharges;

    @Column(name = "discount_amount", precision = 10, scale = 2)
    private BigDecimal discountAmount;

    @Column(name = "total_amount", nullable = false)
    private BigDecimal totalAmount;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "booking_status", nullable = false)
    private BookingStatus bookingStatus = BookingStatus.PENDING;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "payment_status", nullable = false)
    private PaymentStatus paymentStatus = PaymentStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(name = "meeting_mode", nullable = false)
    private MeetingMode meetingMode;

    @Column(name = "transaction_id")
    private String transactionId;

    @Column(name = "meeting_link")
    private String meetingLink;

    @Column(name = "meeting_id")
    private String meetingId;

    @Column(name = "meeting_notes", length = 1000)
    private String meetingNotes;

    @Column(name = "user_notes", length = 500)
    private String userNotes;

    @Version
    private Long version;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}