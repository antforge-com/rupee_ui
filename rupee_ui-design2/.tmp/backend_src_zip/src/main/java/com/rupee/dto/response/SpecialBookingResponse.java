package com.rupee.dto.response;

import com.rupee.enums.BookingEnums.MeetingMode;
import com.rupee.enums.BookingEnums.PaymentStatus;
import com.rupee.enums.SpecialBookingStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SpecialBookingResponse {

    private Long id;
    private Long userId;
    private Long consultantId;

    private int durationInHours;
    private LocalDate scheduledDate;
    private LocalTime scheduledTime;

    private String meetingId;
    private String meetingLink;
    private MeetingMode meetingMode;
    private String userNotes;

    // Financials
    private Long offerId;
    // private BigDecimal baseAmount;
    private BigDecimal discountAmount;
    //private BigDecimal additionalCharges;
    private BigDecimal totalAmount;

    private SpecialBookingStatus status;
    private PaymentStatus paymentStatus;

    private LocalDateTime createdAt;
}