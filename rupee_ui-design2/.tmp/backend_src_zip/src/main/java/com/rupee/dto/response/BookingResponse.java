package com.rupee.dto.response;

import com.rupee.enums.BookingEnums.BookingStatus;
import com.rupee.enums.BookingEnums.MeetingMode;
import com.rupee.enums.BookingEnums.PaymentStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor // Required for Lombok's @Builder to work properly
public class BookingResponse {
    private Long id;
    private Long userId;
    private Long consultantId;
    private List<Long> timeSlotIds; // API sends an array like [101, 102, 103]

    // Full financial breakdown
    // private BigDecimal baseAmount;
    // private BigDecimal additionalCharges;
    private BigDecimal discountAmount;
    private BigDecimal totalAmount;

    private Long offerId;

    private BookingStatus bookingStatus;
    private PaymentStatus paymentStatus;
    private MeetingMode meetingMode;

    private String meetingLink;
    private String meetingId;
    private String meetingNotes;

    private String userNotes;
    private Long version;

    // ==========================================
    // Custom Constructor for JPA DTO Projections
    // JPA will use this specific constructor because the 4th parameter is a String, not a List
    // ==========================================
    @SuppressWarnings("java:S107") // SonarQube bypass: JPA projections require full parameterized constructors
    public BookingResponse(Long id, Long userId, Long consultantId, String timeSlotIdsStr,
                           BigDecimal totalAmount, BigDecimal discountAmount, Long offerId,
                           BookingStatus bookingStatus, PaymentStatus paymentStatus,
                           MeetingMode meetingMode, String meetingLink, String meetingId,
                           String meetingNotes, String userNotes, Long version) {
        this.id = id;
        this.userId = userId;
        this.consultantId = consultantId;

        // ✅ Instantly parse the database string ("101,102") into a List of Longs
        if (timeSlotIdsStr != null && !timeSlotIdsStr.isEmpty()) {
            this.timeSlotIds = Arrays.stream(timeSlotIdsStr.split(","))
                    .map(String::trim)
                    .map(Long::valueOf)
                    .toList();
        }

        this.totalAmount = totalAmount;
        this.discountAmount = discountAmount;
        this.offerId = offerId;
        this.bookingStatus = bookingStatus;
        this.paymentStatus = paymentStatus;
        this.meetingMode = meetingMode;
        this.meetingLink = meetingLink;
        this.meetingId = meetingId;
        this.meetingNotes = meetingNotes;
        this.userNotes = userNotes;
        this.version = version;
    }
}