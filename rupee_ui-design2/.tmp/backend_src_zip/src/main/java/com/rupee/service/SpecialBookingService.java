package com.rupee.service;

import com.rupee.dto.request.GiveSlotRequest;
import com.rupee.dto.request.SpecialBookingRequest;
import com.rupee.dto.request.RescheduleSpecialBookingRequest;
import com.rupee.dto.response.SpecialBookingResponse;
import com.rupee.entity.MasterTimeSlot;
import com.rupee.entity.Offer;
import com.rupee.entity.SpecialBooking;
import com.rupee.entity.SystemConfig;
import com.rupee.entity.TimeSlot;
import com.rupee.entity.User;
import com.rupee.enums.BookingEnums.*;
import com.rupee.enums.BookingEnums.BookingStatus;
import com.rupee.enums.BookingEnums.PaymentStatus;
import com.rupee.enums.OfferStatus;
import com.rupee.enums.SpecialBookingStatus;
import com.rupee.enums.TimeSlotEnums.SlotStatus;
import com.rupee.enums.UserEnums.Role;
import com.rupee.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class SpecialBookingService {

    private final SpecialBookingRepository specialBookingRepository;
    private final SecurityService securityService;
    private final SystemConfigRepository systemConfigRepository;
    private final OfferRepository offerRepository;
    private final BookingRepository bookingRepository;
    private final NotificationService notificationService;
    private final UserRepository userRepository;

    private final TimeSlotRepository timeSlotRepository;
    private final MasterTimeSlotRepository masterTimeSlotRepository;
    private final ConsultantSpecialDayRepository specialDayRepository;

    // A lightweight record to hold pre-parsed times and reduce string manipulation complexity
    private record TimeBlock(LocalTime start, LocalTime end) {}

    // ==========================================
    // 1. CREATE SPECIAL BOOKING
    // ==========================================
    // 1. User Requests and Pays
    @Transactional
    public SpecialBookingResponse createSpecialBooking(SpecialBookingRequest request) {
        User currentUser = securityService.getCurrentUser();

        // CHANGED: We now take the flat session amount instead of multiplying by slots
        BigDecimal combinedBaseAmount = request.getSessionAmount();
        BigDecimal discountAmount = BigDecimal.ZERO;
        BigDecimal additionalCharges = BigDecimal.ZERO;
        BigDecimal totalAmount = BigDecimal.ZERO;
        PaymentStatus initialPaymentStatus = PaymentStatus.PENDING;

        Long finalOfferId = request.getOfferId();

        // MEMBER Override: Free Bookings bypass payment gateway
        if (currentUser.getRole() == Role.MEMBER) {
            combinedBaseAmount = BigDecimal.ZERO;
            initialPaymentStatus = PaymentStatus.SUCCESS;
            finalOfferId = null; // 🚨 PREVENT BURNING THE PROMO CODE
        } else {
            discountAmount = calculateDiscountAmount(finalOfferId, combinedBaseAmount, currentUser.getId());
            BigDecimal discountedBaseAmount = combinedBaseAmount.subtract(discountAmount).max(BigDecimal.ZERO);

            String feeType = systemConfigRepository.findByKey("FEE_TYPE")
                    .map(config -> config.getValue().toUpperCase()).orElse("FLAT");

            BigDecimal feeValue = new BigDecimal(systemConfigRepository.findByKey("FEE_VALUE")
                    .map(SystemConfig::getValue).orElse("0.00"));

            if ("PERCENTAGE".equals(feeType)) {
                additionalCharges = discountedBaseAmount.multiply(feeValue).divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP);
            } else {
                additionalCharges = feeValue;
            }

            totalAmount = discountedBaseAmount.add(additionalCharges);

            // Auto-complete payment if promo code makes it free
            if (totalAmount.compareTo(BigDecimal.ZERO) == 0) {
                initialPaymentStatus = PaymentStatus.SUCCESS;
            }
        }

        SpecialBooking booking = SpecialBooking.builder()
                .userId(currentUser.getId())
                .consultantId(request.getConsultantId())
                .durationInHours(request.getDurationInHours())
                .meetingMode(request.getMeetingMode())
                .baseAmount(combinedBaseAmount)
                .discountAmount(discountAmount)
                .additionalCharges(additionalCharges)
                .totalAmount(totalAmount)
                .offerId(finalOfferId)
                .userNotes(request.getUserNotes())
                .status(SpecialBookingStatus.REQUESTED)
                .paymentStatus(initialPaymentStatus)
                .build();

        SpecialBooking saved = specialBookingRepository.save(booking);

        userRepository.findByConsultantId(saved.getConsultantId()).ifPresent(consultant ->
                notificationService.notifySpecialBookingRequested(
                        new NotificationService.SpecialBookingEventData(
                                saved.getUserId(), consultant.getId(), saved.getId(),
                                request.getDurationInHours(), saved.getMeetingMode().name(),
                                null, null, saved.getUserNotes(), null
                        )
                )
        );

        return mapToResponse(saved);
    }

    // ==========================================
    // 2. ASSIGN SLOT (SMART OVERLAP DETECTOR)
    // ==========================================
    // 2. Consultant Clicks "Give Slot" (SMART OVERLAP DETECTOR)
    @Transactional
    public SpecialBookingResponse giveSlot(Long id, GiveSlotRequest request) {
        SpecialBooking booking = specialBookingRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Special booking not found"));

        if (booking.getStatus() != SpecialBookingStatus.REQUESTED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Slot has already been given or booking is cancelled.");
        }

        // Check if the selected date is a Special Booking Day
        if (!specialDayRepository.existsByConsultantIdAndSpecialDate(booking.getConsultantId(), request.getDate())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The selected date is not enabled for Special Bookings by this Consultant.");
        }

        // Passing the single duration parameter to check the continuous block
        LocalTime finalStartTime = findAvailableSlot(
                request.getStartTime(), booking.getDurationInHours(), request.getDate(), booking.getConsultantId(), id
        );

        booking.setScheduledDate(request.getDate());
        booking.setScheduledTime(finalStartTime);
        booking.setStatus(SpecialBookingStatus.CONFIRMED);

        // ✅ SANITIZATION: Explicitly wipe meeting links if mode is PHYSICAL or PHONE
        if (booking.getMeetingMode() != null && booking.getMeetingMode() != MeetingMode.ONLINE) {
            booking.setMeetingLink(null);
            booking.setMeetingId(null);
        } else {
            booking.setMeetingLink(request.getMeetingLink());
            booking.setMeetingId(request.getMeetingId());
        }

        SpecialBooking saved = specialBookingRepository.save(booking);

        log.info("AUDIT: Slot given for Special Booking ID: {}. Assigned Date: {}, Assigned Time: {}",
                id, saved.getScheduledDate(), saved.getScheduledTime());

        userRepository.findByConsultantId(saved.getConsultantId()).ifPresent(consultant ->
                notificationService.notifySpecialBookingConfirmed(
                        new NotificationService.SpecialBookingEventData(
                                saved.getUserId(), consultant.getId(), saved.getId(),
                                saved.getDurationInHours(), saved.getMeetingMode().name(),
                                saved.getScheduledDate().toString(), saved.getScheduledTime().toString(),
                                null, saved.getMeetingLink()
                        )
                )
        );

        return mapToResponse(saved);
    }

    // ==========================================
    // 3. RESCHEDULE SPECIAL BOOKING
    // ==========================================
    @Transactional
    public SpecialBookingResponse rescheduleSpecialBooking(Long id, RescheduleSpecialBookingRequest request) {
        SpecialBooking booking = specialBookingRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Special booking not found"));

        User currentUser = securityService.getCurrentUser();

        boolean isUnauthorizedConsultant = currentUser.getRole() == Role.CONSULTANT
                && !booking.getConsultantId().equals(currentUser.getConsultantId());

        boolean isUnauthorizedUser = currentUser.getRole() != Role.ADMIN
                && currentUser.getRole() != Role.CONSULTANT
                && !booking.getUserId().equals(currentUser.getId());

        if (isUnauthorizedConsultant || isUnauthorizedUser) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only reschedule your own bookings.");
        }

        if (booking.getStatus() != SpecialBookingStatus.CONFIRMED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only CONFIRMED special bookings can be rescheduled.");
        }

        if (!specialDayRepository.existsByConsultantIdAndSpecialDate(booking.getConsultantId(), request.getNewDate())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The new date is not enabled for Special Bookings by this Consultant.");
        }

        // Passing the single duration block
        LocalTime finalStartTime = findAvailableSlot(
                request.getNewTime(), booking.getDurationInHours(), request.getNewDate(), booking.getConsultantId(), id
        );

        booking.setScheduledDate(request.getNewDate());
        booking.setScheduledTime(finalStartTime);

        SpecialBooking saved = specialBookingRepository.save(booking);
        log.info("AUDIT: Special Booking ID {} rescheduled to Date: {}, Time: {}", id, saved.getScheduledDate(), saved.getScheduledTime());

        // ==========================================
        // Notify via the new Reschedule templates
        // ==========================================
        userRepository.findByConsultantId(saved.getConsultantId()).ifPresent(consultant ->
                notificationService.notifySpecialBookingRescheduled(
                        new NotificationService.SpecialBookingEventData(
                                saved.getUserId(), consultant.getId(), saved.getId(),
                                saved.getDurationInHours(), saved.getMeetingMode().name(),
                                saved.getScheduledDate().toString(), saved.getScheduledTime().toString(),
                                null, booking.getMeetingLink()
                        )
                )
        );

        return mapToResponse(saved);
    }

    // ==========================================
    // 4. OVERLAP MATH HELPER METHODS
    // ==========================================
    private LocalTime findAvailableSlot(LocalTime proposedStart, int requiredHours, LocalDate targetDate, Long consultantId, Long bookingId) {
        // Fetch all conflicting schedules for the target date
        List<SpecialBooking> existingSpecials = specialBookingRepository.findConfirmedByConsultantAndDate(consultantId, targetDate);
        List<TimeSlot> existingStandards = timeSlotRepository.findByConsultantIdAndStatusAndSlotDateBetweenOrderBySlotDateAscMasterTimeSlotIdAsc(
                consultantId, SlotStatus.BOOKED, targetDate, targetDate);

        // Pre-parse the strings into reliable LocalTime objects outside the loop
        List<TimeBlock> standardBlocks = parseStandardSlots(existingStandards);
        boolean slotFound = false;

        // THE SMART LOOP: Find the next available continuous block
        while (!slotFound) {
            LocalTime proposedEnd = proposedStart.plusHours(requiredHours);

            // Safety check to ensure we don't accidentally push the meeting past midnight into the next day
            if (proposedEnd.isBefore(proposedStart) || proposedEnd.equals(LocalTime.MIDNIGHT)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not enough continuous hours available on this date from the requested start time.");
            }

            LocalTime maxConflictEnd = findMaxConflictEnd(proposedStart, proposedEnd, bookingId, existingSpecials, standardBlocks);

            // --- Result Evaluation ---
            if (maxConflictEnd == null) {
                slotFound = true; // No overlaps found! This block is completely free.
            } else {
                // If overlap is found, mathematically jump the proposed time to the EXACT minute the conflicting meeting ends!
                proposedStart = maxConflictEnd;
            }
        }
        return proposedStart;
    }

    private LocalTime findMaxConflictEnd(LocalTime proposedStart, LocalTime proposedEnd, Long currentBookingId,
                                         List<SpecialBooking> specials, List<TimeBlock> standards) {
        LocalTime maxConflict = null;

        // --- Check 1: Overlaps with other Special Bookings ---
        for (SpecialBooking sb : specials) {
            if (sb.getId().equals(currentBookingId)) continue;
            LocalTime sbStart = sb.getScheduledTime();
            LocalTime sbEnd = sbStart.plusHours(sb.getDurationInHours());

            if (proposedStart.isBefore(sbEnd) && proposedEnd.isAfter(sbStart) &&
                    (maxConflict == null || sbEnd.isAfter(maxConflict))) {
                maxConflict = sbEnd;
            }
        }

        // --- Check 2: Overlaps with Standard Configured Slots ---
        for (TimeBlock ts : standards) {
            if (proposedStart.isBefore(ts.end()) && proposedEnd.isAfter(ts.start()) &&
                    (maxConflict == null || ts.end().isAfter(maxConflict))) {
                maxConflict = ts.end();
            }
        }
        return maxConflict;
    }

    private List<TimeBlock> parseStandardSlots(List<TimeSlot> standardSlots) {
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("h:mm a");
        return standardSlots.stream()
                .map(ts -> {
                    MasterTimeSlot master = masterTimeSlotRepository.findById(ts.getMasterTimeSlotId()).orElse(null);
                    if (master != null) {
                        try {
                            String[] parts = master.getTimeRange().split("-");
                            return new TimeBlock(
                                    LocalTime.parse(parts[0].trim(), formatter),
                                    LocalTime.parse(parts[1].trim(), formatter)
                            );
                        } catch (Exception e) {
                            log.error("Failed to parse MasterTimeSlot timeRange: {}", master.getTimeRange());
                        }
                    }
                    return null;
                })
                .filter(Objects::nonNull).toList();
    }

    // ==========================================
    // 5. FINANCIAL & UTILITY METHODS
    // ==========================================
    private BigDecimal calculateDiscountAmount(Long offerId, BigDecimal baseAmount, Long userId) {
        if (offerId == null) return BigDecimal.ZERO;

        boolean alreadyUsed = bookingRepository.existsByUserIdAndOfferIdAndBookingStatusNot(
                userId, offerId, BookingStatus.CANCELLED);
        if (alreadyUsed) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You have already used this promo code.");

        Offer offer = offerRepository.findById(offerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Selected offer not found"));

        LocalDateTime now = LocalDateTime.now();
        if (!offer.isActive() || offer.getStatus() != OfferStatus.APPROVED || now.isBefore(offer.getValidFrom()) || now.isAfter(offer.getValidTo())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This offer is invalid, expired, or not approved");
        }

        BigDecimal discountAmount;
        String discountStr = offer.getDiscount();
        if (discountStr.contains("%")) {
            BigDecimal percentage = new BigDecimal(discountStr.replace("%", "").trim());
            discountAmount = baseAmount.multiply(percentage).divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP);
        } else {
            discountAmount = new BigDecimal(discountStr.trim());
        }

        return discountAmount.min(baseAmount);
    }

    @Transactional(readOnly = true)
    public Page<SpecialBookingResponse> getMySpecialBookings(int page, int size) {
        Long userId = securityService.getCurrentUser().getId();
        Pageable pageable = PageRequest.of(page, size, Sort.by("id").descending());
        return specialBookingRepository.findByUserId(userId, pageable).map(this::mapToResponse);
    }

    @Transactional(readOnly = true)
    public Page<SpecialBookingResponse> getConsultantSpecialBookings(Long consultantId, int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("id").descending());
        return specialBookingRepository.findByConsultantId(consultantId, pageable).map(this::mapToResponse);
    }

    @Transactional(readOnly = true)
    public Page<SpecialBookingResponse> getAllSpecialBookings(int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("id").descending());
        return specialBookingRepository.findAll(pageable).map(this::mapToResponse);
    }

    private SpecialBookingResponse mapToResponse(SpecialBooking booking) {
        return SpecialBookingResponse.builder()
                .id(booking.getId())
                .userId(booking.getUserId())
                .consultantId(booking.getConsultantId())
                .durationInHours(booking.getDurationInHours())
                .scheduledDate(booking.getScheduledDate())
                .scheduledTime(booking.getScheduledTime())
                .meetingId(booking.getMeetingId())
                .meetingLink(booking.getMeetingLink())
                .meetingMode(booking.getMeetingMode())
                .userNotes(booking.getUserNotes())
                .offerId(booking.getOfferId())
                //.baseAmount(booking.getBaseAmount()) // Hidden for privacy if needed
                .discountAmount(booking.getDiscountAmount())
                .totalAmount(booking.getTotalAmount())
                .status(booking.getStatus())
                .paymentStatus(booking.getPaymentStatus())
                .createdAt(booking.getCreatedAt())
                .build();
    }
}