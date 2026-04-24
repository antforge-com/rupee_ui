package com.rupee.service;

import com.rupee.dto.request.BookingRequest;
import com.rupee.dto.request.BookingUpdateRequest;
import com.rupee.dto.request.BulkBookingRequest;
import com.rupee.dto.request.RescheduleBookingRequest;
import com.rupee.dto.request.RescheduleBulkBookingRequest;
import com.rupee.dto.request.BulkBookingUpdateRequest;
import com.rupee.dto.response.BookingResponse;
import com.rupee.dto.response.BulkBookingResponse;
import com.rupee.entity.*;
import com.rupee.enums.BookingEnums.*;
import com.rupee.enums.BookingEnums.BookingStatus;
import com.rupee.enums.BookingEnums.PaymentStatus;
import com.rupee.enums.NotificationType;
import com.rupee.enums.OfferStatus;
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
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class BookingService {

    private final BookingRepository bookingRepository;
    private final TimeSlotRepository timeSlotRepository;
    private final OfferRepository offerRepository;
    private final SecurityService securityService;
    private final EmailService emailService;
    private final UserRepository userRepository;
    private final SystemConfigRepository systemConfigRepository;
    private final ConsultantSpecialDayRepository specialDayRepository;
    private final NotificationService notificationService;

    private static final String BOOKING_NOT_FOUND_MSG = "Booking not found";
    private static final String KEY_COMPLETED = "completed";

    // A lightweight record to pass all calculated financials cleanly
    private record BookingFinancials(
            BigDecimal baseAmount,
            BigDecimal discountAmount,
            BigDecimal additionalCharges,
            BigDecimal totalAmount,
            PaymentStatus paymentStatus,
            BookingStatus bookingStatus,
            Long offerId
    ) {}

    // === CRUD OPERATIONS ===

    @Transactional
    public BookingResponse createBooking(BookingRequest request) {
        User currentUser = securityService.getCurrentUser();

        // Extracted slot validation logic to helper
        TimeSlot slot = validateAndLockSlot(request.getTimeSlotId(), request.getConsultantId());

        // Extracted complex financial calculation logic to helper
        BookingFinancials financials = calculateFinancials(request.getBaseAmount(), request.getOfferId(), currentUser);

        // --- 4. Save Booking ---
        Booking booking = Booking.builder()
                .userId(currentUser.getId())
                .consultantId(request.getConsultantId())
                .timeSlotIds(String.valueOf(slot.getId()))
                .offerId(financials.offerId())
                .baseAmount(financials.baseAmount())
                .discountAmount(financials.discountAmount())
                .additionalCharges(financials.additionalCharges())
                .totalAmount(financials.totalAmount())
                .meetingMode(request.getMeetingMode())
                .userNotes(request.getUserNotes())
                .bookingStatus(financials.bookingStatus())
                .paymentStatus(financials.paymentStatus())
                .build();

        // Explicitly wipe meeting links if mode is PHYSICAL or PHONE
        if (booking.getMeetingMode() != null && booking.getMeetingMode() != MeetingMode.ONLINE) {
            booking.setMeetingLink(null);
            booking.setMeetingId(null);
        }

        Booking savedBooking = bookingRepository.save(booking);

        // SMART LOGGING: Audit based on the new total amount
        boolean isPaidBooking = savedBooking.getTotalAmount() != null && savedBooking.getTotalAmount().doubleValue() > 0;
        if (isPaidBooking) {
            // Updated log to show the discount amount
            log.info("FINANCE AUDIT: Paid Booking ID {} created by User ID {} for Base: {}, Discount: {}, Fee: {}, Total: {}",
                    savedBooking.getId(), currentUser.getId(), savedBooking.getBaseAmount(),
                    savedBooking.getDiscountAmount(), savedBooking.getAdditionalCharges(), savedBooking.getTotalAmount());
        } else {
            // We use 'else' to catch ALL unpaid bookings (100% discount or free slots),
            // but we keep the highly detailed audit log!
            log.info("FREE/VIP AUDIT: Client User ID {} (Role: {}) booked Consultant ID {} (Booking ID: {})",
                    currentUser.getId(), currentUser.getRole(), request.getConsultantId(), savedBooking.getId());
        }

        String amountStr = savedBooking.getTotalAmount() != null ? savedBooking.getTotalAmount().toString() : "0.00";
        String discountStr = savedBooking.getDiscountAmount() != null ? savedBooking.getDiscountAmount().toString() : "0.00";

        notificationService.notifyNormalBookingCreated(
                currentUser.getId(),
                request.getConsultantId(),
                savedBooking.getId(),
                savedBooking.getMeetingMode().name(),
                amountStr,
                discountStr,
                savedBooking.getMeetingLink()
        );

        return mapToResponse(savedBooking);
    }

    @Transactional
    public BulkBookingResponse createBulkBooking(BulkBookingRequest request) {
        User currentUser = securityService.getCurrentUser();

        int numberOfSlots = request.getTimeSlotIds().size();
        BigDecimal combinedBaseAmount = request.getBaseAmountPerSlot().multiply(new BigDecimal(numberOfSlots));

        // Extracted financial logic to helper
        BookingFinancials financials = calculateFinancials(combinedBaseAmount, request.getOfferId(), currentUser);

        // Extracted Bulk Slot Validation and Locking
        String combinedSlotIds = validateAndLockBulkSlots(request.getTimeSlotIds(), request.getConsultantId());

        // Save exactly ONE Booking record!
        Booking bulkBooking = Booking.builder()
                .userId(currentUser.getId())
                .consultantId(request.getConsultantId())
                .timeSlotIds(combinedSlotIds)
                .baseAmount(financials.baseAmount())
                .discountAmount(financials.discountAmount())
                .additionalCharges(financials.additionalCharges())
                .totalAmount(financials.totalAmount())
                .offerId(financials.offerId())
                .meetingMode(request.getMeetingMode())
                .userNotes(request.getUserNotes())
                .bookingStatus(financials.bookingStatus())
                .paymentStatus(financials.paymentStatus())
                .build();

        // SANITIZATION: Explicitly wipe meeting links if mode is PHYSICAL or PHONE
        if (bulkBooking.getMeetingMode() != null && bulkBooking.getMeetingMode() != MeetingMode.ONLINE) {
            bulkBooking.setMeetingLink(null);
            bulkBooking.setMeetingId(null);
        }

        Booking savedBooking = bookingRepository.save(bulkBooking);

        notificationService.notifyNormalBookingCreated(
                currentUser.getId(),
                request.getConsultantId(),
                savedBooking.getId(),
                savedBooking.getMeetingMode().name(),
                financials.totalAmount().toString(),
                financials.discountAmount().toString(),
                savedBooking.getMeetingLink()
        );

        return BulkBookingResponse.builder()
                .bookingId(savedBooking.getId())
                .timeSlotIds(request.getTimeSlotIds())
                .message("Bulk Booking successfully created")
                .build();
    }

    @Transactional
    public BookingResponse rescheduleBooking(Long bookingId, RescheduleBookingRequest request) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, BOOKING_NOT_FOUND_MSG));

        if (booking.getTimeSlotIds().contains(",")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This is a bulk booking. Please use the bulk reschedule endpoint.");
        }

        User currentUser = securityService.getCurrentUser();
        validateBookingOwnership(booking, currentUser);

        TimeSlot newSlot = validateAndLockSlot(request.getNewTimeSlotId(), booking.getConsultantId());

        timeSlotRepository.findById(Long.valueOf(booking.getTimeSlotIds())).ifPresent(oldSlot -> {
            oldSlot.setStatus(SlotStatus.AVAILABLE);
            timeSlotRepository.save(oldSlot);
        });

        booking.setTimeSlotIds(String.valueOf(newSlot.getId()));
        Booking savedBooking = bookingRepository.save(booking);

        log.info("AUDIT: Booking ID {} rescheduled to new TimeSlot ID {}", bookingId, newSlot.getId());

        notificationService.notifyNormalBookingRescheduled(
                currentUser.getId(),
                savedBooking.getConsultantId(),
                savedBooking.getId(),
                savedBooking.getMeetingMode().name(),
                savedBooking.getMeetingLink()
        );

        return mapToResponse(savedBooking);
    }

    @Transactional
    public BookingResponse rescheduleBulkBooking(Long bookingId, RescheduleBulkBookingRequest request) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, BOOKING_NOT_FOUND_MSG));

        if (!booking.getTimeSlotIds().contains(",")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This is a normal booking. Please use the standard reschedule endpoint.");
        }

        User currentUser = securityService.getCurrentUser();
        validateBookingOwnership(booking, currentUser);

        List<String> currentSlots = new ArrayList<>(Arrays.asList(booking.getTimeSlotIds().split(",")));
        String oldSlotStr = String.valueOf(request.getOldTimeSlotId());

        if (!currentSlots.contains(oldSlotStr)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The old time slot ID provided does not belong to this bulk booking.");
        }

        TimeSlot newSlot = validateAndLockSlot(request.getNewTimeSlotId(), booking.getConsultantId());

        timeSlotRepository.findById(request.getOldTimeSlotId()).ifPresent(oldSlot -> {
            oldSlot.setStatus(SlotStatus.AVAILABLE);
            timeSlotRepository.save(oldSlot);
        });

        currentSlots.remove(oldSlotStr);
        currentSlots.add(String.valueOf(newSlot.getId()));
        booking.setTimeSlotIds(String.join(",", currentSlots));

        Booking savedBooking = bookingRepository.save(booking);

        log.info("AUDIT: Bulk Booking ID {} rescheduled. Replaced Slot {} with Slot {}", bookingId, request.getOldTimeSlotId(), newSlot.getId());

        notificationService.notifyNormalBookingRescheduled(
                currentUser.getId(),
                savedBooking.getConsultantId(),
                savedBooking.getId(),
                savedBooking.getMeetingMode().name(),
                savedBooking.getMeetingLink()
        );

        return mapToResponse(savedBooking);
    }

    @Transactional(readOnly = true)
    public BookingResponse getBookingById(Long id) {
        return bookingRepository.findBookingByIdDTO(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, BOOKING_NOT_FOUND_MSG));
    }

    // Fetch all bookings for the Admin Dashboard
    @Transactional(readOnly = true)
    public Page<BookingResponse> getAllBookings(int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("id").descending());
        return bookingRepository.findAllDTO(pageable);
    }

    @Transactional(readOnly = true)
    public Page<BookingResponse> getBookingsByStatus(BookingStatus status, int page, int size) {
        User currentUser = securityService.getCurrentUser();
        Pageable pageable = PageRequest.of(page, size, Sort.by("id").descending());

        // 1. ADMINS: Can see everything
        if (currentUser.getRole() == Role.ADMIN) {
            return bookingRepository.findByBookingStatusDTO(status, pageable);
        }

        // 2. CONSULTANTS: Only their own bookings with that status
        if (currentUser.getRole() == Role.CONSULTANT) {
            return bookingRepository.findByConsultantIdAndBookingStatusDTO(currentUser.getId(), status, pageable);
        }

        // 3. REGULAR USERS: Only their own bookings with that status
        return bookingRepository.findByUserIdAndBookingStatusDTO(currentUser.getId(), status, pageable);
    }

    @Transactional(readOnly = true)
    public Page<BookingResponse> getMyBookings(int page, int size) {
        Long currentUserId = securityService.getCurrentUser().getId();
        Pageable pageable = PageRequest.of(page, size, Sort.by("id").descending());
        return bookingRepository.findByUserIdDTO(currentUserId, pageable);
    }

    @Transactional(readOnly = true)
    public Page<BookingResponse> getConsultantBookings(Long consultantId, int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("id").descending());
        return bookingRepository.findByConsultantIdDTO(consultantId, pageable);
    }

    @Transactional
    public BookingResponse updateBooking(Long id, BookingUpdateRequest request) {
        Booking booking = bookingRepository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, BOOKING_NOT_FOUND_MSG));

        // Block bulk bookings from using the standard update endpoint
        if (booking.getTimeSlotIds().contains(",")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This is a bulk booking. Please use the /api/bookings/bulk/{id} update endpoint.");
        }

        User currentUser = securityService.getCurrentUser();

        // 1. Check Security
        enforceConsultantSecurityRules(currentUser, booking, request);
        enforceUserSecurityRules(currentUser, booking, request);

        // Keep track of the old consultant ID in case the Admin reassigns it
        Long originalConsultantId = booking.getConsultantId();

        // 2. Process specific business rules via helper methods
        boolean reassigned = handleReassignment(booking, request);
        boolean statusChanged = handleStatusChange(booking, request);
        boolean paymentChanged = handlePaymentChange(booking, request);

        // 3. Update simple fields
        updateBasicFields(booking, request);

        // 4. Save to database
        Booking updatedBooking = bookingRepository.save(booking);

        // 5. Handle logging
        logAuditEvents(updatedBooking, statusChanged || paymentChanged, reassigned);

        // 6. Trigger Emails
        triggerStatusChangeEmails(updatedBooking, statusChanged);
        triggerReassignmentEmails(updatedBooking, reassigned, originalConsultantId);

        return mapToResponse(updatedBooking);
    }

    @Transactional
    public BookingResponse updateBulkBooking(Long id, BulkBookingUpdateRequest request) {
        Booking booking = bookingRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bulk Booking not found"));

        // Block normal bookings from using the bulk update endpoint
        if (!booking.getTimeSlotIds().contains(",")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This is a normal booking. Please use the standard update endpoint.");
        }

        // Track changes for emails and logs
        boolean statusChanged = false;
        boolean paymentChanged = false;
        boolean reassigned = false;
        Long originalConsultantId = booking.getConsultantId();

        if (request.getBookingStatus() != null && request.getBookingStatus() != booking.getBookingStatus()) {
            booking.setBookingStatus(request.getBookingStatus());
            statusChanged = true;
        }

        if (request.getPaymentStatus() != null && request.getPaymentStatus() != booking.getPaymentStatus()) {
            booking.setPaymentStatus(request.getPaymentStatus());
            paymentChanged = true;
        }

        // ✅ SONARQUBE FIX: Extracted bulk basic updates to reduce Cognitive Complexity
        updateBulkBasicFields(booking, request);

        if (request.getTimeSlotIds() != null && !request.getTimeSlotIds().isEmpty()) {
            reassigned = true;
            processBulkReassignment(booking, request);
        }

        Booking savedBooking = bookingRepository.save(booking);

        // ==========================================
        // Fire Audits and Emails!
        // ==========================================
        logAuditEvents(savedBooking, statusChanged || paymentChanged, reassigned);
        triggerStatusChangeEmails(savedBooking, statusChanged);
        triggerReassignmentEmails(savedBooking, reassigned, originalConsultantId);

        return mapToResponse(savedBooking);
    }

    private void processBulkReassignment(Booking booking, BulkBookingUpdateRequest request) {
        // ✅ SONARQUBE FIX: Reused freeTimeSlots method to eliminate duplicate loop logic
        freeTimeSlots(booking.getTimeSlotIds());

        List<Long> newIds = request.getTimeSlotIds();
        for (Long newId : newIds) {
            TimeSlot slot = timeSlotRepository.findById(newId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "New slot not found: " + newId));
            slot.setStatus(SlotStatus.BOOKED);
            timeSlotRepository.save(slot);
        }

        String newSlotString = newIds.stream().map(String::valueOf).collect(Collectors.joining(","));
        booking.setTimeSlotIds(newSlotString);

        if (request.getConsultantId() != null) {
            booking.setConsultantId(request.getConsultantId());
        }
    }

    // === PRIVATE HELPER METHODS FOR REDUCED COMPLEXITY ===

    // ✅ SONARQUBE FIX: Shared Helper for Financials extraction
    private BookingFinancials calculateFinancials(BigDecimal originalBaseAmount, Long requestedOfferId, User currentUser) {
        if (currentUser.getRole() == Role.MEMBER) {
            // MEMBERS GET IT 100% FREE AND AUTO-CONFIRMED
            return new BookingFinancials(
                    BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                    PaymentStatus.SUCCESS, BookingStatus.CONFIRMED, null // 🚨 PREVENT BURNING THE PROMO CODE
            );
        }

        // --- APPLY OFFER LOGIC FOR REGULAR USERS ---
        BigDecimal discountAmount = calculateDiscountAmount(requestedOfferId, originalBaseAmount, currentUser.getId());
        BigDecimal discountedBaseAmount = originalBaseAmount.subtract(discountAmount).max(BigDecimal.ZERO);

        // --- Dynamic Fee Calculation ---
        String feeType = systemConfigRepository.findByKey("FEE_TYPE").map(config -> config.getValue().toUpperCase()).orElse("FLAT");
        BigDecimal feeValue = new BigDecimal(systemConfigRepository.findByKey("FEE_VALUE").map(SystemConfig::getValue).orElse("0.00"));

        BigDecimal additionalCharges;
        if ("PERCENTAGE".equals(feeType)) {
            additionalCharges = discountedBaseAmount.multiply(feeValue).divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP);
        } else {
            additionalCharges = feeValue;
        }

        BigDecimal totalAmount = discountedBaseAmount.add(additionalCharges);
        PaymentStatus paymentStatus = PaymentStatus.PENDING;
        BookingStatus bookingStatus = BookingStatus.PENDING;

        // If a 100% promo code made the total 0, mark payment as successful automatically
        if (totalAmount.compareTo(BigDecimal.ZERO) == 0) {
            paymentStatus = PaymentStatus.SUCCESS;
            bookingStatus = BookingStatus.CONFIRMED;
        }

        return new BookingFinancials(
                originalBaseAmount, discountAmount, additionalCharges, totalAmount,
                paymentStatus, bookingStatus, requestedOfferId
        );
    }

    // ✅ SONARQUBE FIX: Shared Helper for Slot Validation & Locking
    private TimeSlot validateAndLockSlot(Long slotId, Long consultantId) {
        TimeSlot slot = timeSlotRepository.findById(slotId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Time slot not found"));

        if (slot.getStatus() != SlotStatus.AVAILABLE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The selected time slot is no longer available");
        }
        if (specialDayRepository.existsByConsultantIdAndSpecialDate(consultantId, slot.getSlotDate())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Normal bookings are not allowed on Consultant Special Booking days.");
        }

        slot.setStatus(SlotStatus.BOOKED);
        return timeSlotRepository.save(slot);
    }

    // ✅ SONARQUBE FIX: Bulk Slot Validation and locking
    private String validateAndLockBulkSlots(List<Long> timeSlotIds, Long consultantId) {
        List<TimeSlot> slotsToUpdate = new ArrayList<>();
        for (Long slotId : timeSlotIds) {
            TimeSlot slot = timeSlotRepository.findById(slotId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Time slot not found: " + slotId));

            if (slot.getStatus() != SlotStatus.AVAILABLE) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Time slot " + slotId + " is no longer available");
            }

            // Check Special Days
            if (specialDayRepository.existsByConsultantIdAndSpecialDate(consultantId, slot.getSlotDate())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Normal bookings are not allowed on Consultant Special Booking days.");
            }

            // Lock the slot
            slot.setStatus(SlotStatus.BOOKED);
            slotsToUpdate.add(slot);
        }
        timeSlotRepository.saveAll(slotsToUpdate);

        // Convert List of IDs into a single string
        return timeSlotIds.stream()
                .map(String::valueOf)
                .collect(Collectors.joining(","));
    }

    // ✅ SONARQUBE FIX: Extracted method to free time slots to reduce complexity and duplication
    private void freeTimeSlots(String timeSlotIds) {
        String[] slotIds = timeSlotIds.split(",");
        for (String idStr : slotIds) {
            timeSlotRepository.findById(Long.valueOf(idStr.trim())).ifPresent(slot -> {
                slot.setStatus(SlotStatus.AVAILABLE);
                timeSlotRepository.save(slot);
            });
        }
    }

    // ✅ SONARQUBE FIX: Extracted method to re-lock time slots to reduce complexity
    private void reLockTimeSlots(String timeSlotIds) {
        String[] slotIds = timeSlotIds.split(",");
        for (String idStr : slotIds) {
            timeSlotRepository.findById(Long.valueOf(idStr.trim())).ifPresent(slot -> {
                if (slot.getStatus() == SlotStatus.AVAILABLE) {
                    slot.setStatus(SlotStatus.BOOKED);
                    timeSlotRepository.save(slot);
                } else {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot restore booking. The time slot has already been taken by someone else.");
                }
            });
        }
    }

    // ✅ SONARQUBE FIX: Extracted bulk basic updates to reduce Cognitive Complexity
    private void updateBulkBasicFields(Booking booking, BulkBookingUpdateRequest request) {
        if (request.getMeetingMode() != null) booking.setMeetingMode(request.getMeetingMode());
        if (request.getMeetingNotes() != null) booking.setMeetingNotes(request.getMeetingNotes());

        // SANITIZATION: Explicitly wipe meeting links if mode is PHYSICAL or PHONE
        if (booking.getMeetingMode() != null && booking.getMeetingMode() != MeetingMode.ONLINE) {
            booking.setMeetingLink(null);
            booking.setMeetingId(null);
        } else {
            if (request.getMeetingLink() != null) booking.setMeetingLink(request.getMeetingLink());
            if (request.getMeetingId() != null) booking.setMeetingId(request.getMeetingId());
        }
    }

    private void validateBookingOwnership(Booking booking, User currentUser) {
        boolean isUnauthorizedConsultant = currentUser.getRole() == Role.CONSULTANT
                && !booking.getConsultantId().equals(currentUser.getConsultantId());
        boolean isUnauthorizedUser = currentUser.getRole() != Role.ADMIN
                && currentUser.getRole() != Role.CONSULTANT
                && !booking.getUserId().equals(currentUser.getId());

        if (isUnauthorizedConsultant || isUnauthorizedUser) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only reschedule your own bookings.");
        }
    }

    private void enforceConsultantSecurityRules(User currentUser, Booking booking, BookingUpdateRequest request) {
        if (currentUser.getRole() != Role.CONSULTANT) {
            return; // Admins and Users bypass these specific rules
        }

        // 1. Ensure the consultant actually owns this booking
        if (!booking.getConsultantId().equals(currentUser.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You are only authorized to manage your own bookings.");
        }

        // 2. Ensure they are ONLY cancelling or updating meeting notes/links
        boolean attemptingForbiddenAction = request.getTimeSlotId() != null
                || request.getConsultantId() != null || request.getPaymentStatus() != null;
        if (attemptingForbiddenAction) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Consultants are only authorized to cancel bookings or update meeting links.");
        }
    }

    private void enforceUserSecurityRules(User currentUser, Booking booking, BookingUpdateRequest request) {
        if (currentUser.getRole() == Role.SUBSCRIBER || currentUser.getRole() == Role.MEMBER) {

            // 1. Ensure the user actually owns this booking!
            if (!booking.getUserId().equals(currentUser.getId())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You are only authorized to manage your own bookings.");
            }

            // 2. Ensure they are ONLY cancelling (or updating notes). They cannot touch money, times, or consultants.
            boolean attemptingForbiddenAction = request.getTimeSlotId() != null
                    || request.getConsultantId() != null || request.getPaymentStatus() != null || request.getMeetingLink() != null;
            if (attemptingForbiddenAction) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Clients are only authorized to cancel bookings.");
            }
        }
    }

    private boolean handleReassignment(Booking booking, BookingUpdateRequest request) {
        // Early return if no reassignment requested
        if (request.getTimeSlotId() == null) {
            return false;
        }

        TimeSlot newSlot = timeSlotRepository.findById(request.getTimeSlotId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "New time slot not found"));

        if (newSlot.getStatus() != SlotStatus.AVAILABLE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The new time slot is no longer available.");
        }

        // Free up the OLD slot
        timeSlotRepository.findById(Long.valueOf(booking.getTimeSlotIds())).ifPresent(oldSlot -> {
            oldSlot.setStatus(SlotStatus.AVAILABLE);
            timeSlotRepository.save(oldSlot);
        });

        // Lock the NEW slot
        newSlot.setStatus(SlotStatus.BOOKED);
        timeSlotRepository.save(newSlot);

        booking.setTimeSlotIds(String.valueOf(newSlot.getId()));

        if (request.getConsultantId() != null) {
            booking.setConsultantId(request.getConsultantId());
        }
        return true;
    }

    // ✅ SONARQUBE FIX: Replaced loops with helper methods to fix Cognitive Complexity
    private boolean handleStatusChange(Booking booking, BookingUpdateRequest request) {
        // 1. If no status change is requested, or it's the same status, do nothing.
        if (request.getBookingStatus() == null || request.getBookingStatus() == booking.getBookingStatus()) {
            return false;
        }

        // Keep track of the OLD status before we change it
        BookingStatus oldStatus = booking.getBookingStatus();

        // Update to the NEW status
        booking.setBookingStatus(request.getBookingStatus());

        // 2. Only free the time slot if we are actively cancelling a previously active booking
        boolean isActivelyCancelling =
                (request.getBookingStatus() == BookingStatus.CANCELLED) &&
                        (oldStatus != BookingStatus.CANCELLED);

        if (isActivelyCancelling) {
            freeTimeSlots(booking.getTimeSlotIds());
        }

        // 3. (Optional but recommended): What if an Admin changes a CANCELLED booking BACK to PENDING?
        // You should probably re-lock the time slot!
        boolean isUnCancelling =
                (oldStatus == BookingStatus.CANCELLED) &&
                        (request.getBookingStatus() != BookingStatus.CANCELLED);

        if (isUnCancelling) {
            reLockTimeSlots(booking.getTimeSlotIds());
        }
        return true;
    }

    private boolean handlePaymentChange(Booking booking, BookingUpdateRequest request) {
        if (request.getPaymentStatus() == null || request.getPaymentStatus() == booking.getPaymentStatus()) return false;
        booking.setPaymentStatus(request.getPaymentStatus());
        return true;
    }

    private void updateBasicFields(Booking booking, BookingUpdateRequest request) {
        if (request.getMeetingMode() != null) booking.setMeetingMode(request.getMeetingMode());
        if (request.getMeetingNotes() != null) booking.setMeetingNotes(request.getMeetingNotes());

        // SANITIZATION: Explicitly wipe meeting links if mode is PHYSICAL or PHONE
        if (booking.getMeetingMode() != null && booking.getMeetingMode() != MeetingMode.ONLINE) {
            booking.setMeetingLink(null);
            booking.setMeetingId(null);
        } else {
            if (request.getMeetingLink() != null) booking.setMeetingLink(request.getMeetingLink());
            if (request.getMeetingId() != null) booking.setMeetingId(request.getMeetingId());
        }
    }

    private void logAuditEvents(Booking booking, boolean isFinanceChanged, boolean reassigned) {
        if (isFinanceChanged && booking.getTotalAmount() != null && booking.getTotalAmount().doubleValue() > 0) {
            log.info("FINANCE AUDIT: Paid Booking ID {} status changed. New Booking Status: {}, New Payment Status: {}",
                    booking.getId(), booking.getBookingStatus(), booking.getPaymentStatus());
        }
        if (reassigned) {
            log.info("ADMIN ACTION: Booking ID {} reassigned to Consultant ID {} and TimeSlot ID {}",
                    booking.getId(), booking.getConsultantId(), booking.getTimeSlotIds());
        }
    }

    // ==========================================
    // REFACTORED: Route Cancellations through the secure Notification Engine
    // ==========================================
    private void triggerStatusChangeEmails(Booking updatedBooking, boolean statusChanged) {
        if (!statusChanged || updatedBooking.getBookingStatus() != BookingStatus.CANCELLED) {
            return;
        }

        // Email User via NotificationService
        userRepository.findById(updatedBooking.getUserId()).ifPresent(client -> {
            String msg = "Your booking (#" + updatedBooking.getId() + ") has been cancelled.";
            // We use NotificationType.BOOKING_UPDATED to track cancellations
            notificationService.processNotification(client.getId(), updatedBooking.getId(), msg, NotificationType.BOOKING_UPDATED,
                    email -> emailService.sendBookingCancellationToUser(email, updatedBooking.getId()));
        });

        // Email Consultant via NotificationService
        userRepository.findByConsultantId(updatedBooking.getConsultantId()).ifPresent(consultant -> {
            String msg = "Booking #" + updatedBooking.getId() + " has been cancelled by the client.";
            notificationService.processNotification(consultant.getId(), updatedBooking.getId(), msg, NotificationType.BOOKING_UPDATED,
                    email -> emailService.sendBookingCancellationToConsultant(email, updatedBooking.getId()));
        });
    }

    // ==========================================
    // REFACTORED: Route Reassignments through the secure Notification Engine
    // ==========================================
    private void triggerReassignmentEmails(Booking updatedBooking, boolean reassigned, Long originalConsultantId) {
        if (!reassigned) {
            return;
        }

        // Email User via NotificationService
        userRepository.findById(updatedBooking.getUserId()).ifPresent(client -> {
            String msg = "Your booking (#" + updatedBooking.getId() + ") has been rescheduled/reassigned.";
            notificationService.processNotification(client.getId(), updatedBooking.getId(), msg, NotificationType.BOOKING_UPDATED,
                    email -> emailService.sendBookingReassignedToUser(email, updatedBooking.getId()));
        });

        // Email Old Consultant via NotificationService
        userRepository.findByConsultantId(originalConsultantId).ifPresent(oldConsultant -> {
            String msg = "Booking #" + updatedBooking.getId() + " has been reassigned to another consultant.";
            notificationService.processNotification(oldConsultant.getId(), updatedBooking.getId(), msg, NotificationType.BOOKING_UPDATED,
                    email -> emailService.sendBookingRemovedFromConsultant(email, updatedBooking.getId()));
        });

        // Email New Consultant via NotificationService
        userRepository.findByConsultantId(updatedBooking.getConsultantId()).ifPresent(newConsultant -> {
            String clientEmail = userRepository.findById(updatedBooking.getUserId()).map(User::getIdentifier).orElse("Unknown");
            String msg = "You have been reassigned to Booking #" + updatedBooking.getId() + ".";

            notificationService.processNotification(newConsultant.getId(), updatedBooking.getId(), msg, NotificationType.NEW_ASSIGNMENT,
                    email -> emailService.sendBookingAlertToConsultant(email, updatedBooking.getId(), updatedBooking.getMeetingMode().name(), clientEmail, updatedBooking.getMeetingLink()));
        });
    }

    // ==========================================
    // 7. CANCEL BOOKING (Handles Normal & Bulk natively)
    // ==========================================
    @Transactional
    public void cancelBooking(Long id) {
        Booking booking = bookingRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, BOOKING_NOT_FOUND_MSG));

        // If it is already cancelled, stop immediately and do nothing!
        if (booking.getBookingStatus() == BookingStatus.CANCELLED) {
            return; // Early exit. This makes the endpoint safely idempotent.
        }

        // 1. Mark the booking as CANCELLED instead of wiping it from the DB
        booking.setBookingStatus(BookingStatus.CANCELLED);
        Booking savedBooking = bookingRepository.save(booking);

        // 2. Free up ALL Time Slots mapped to this booking
        // ✅ SONARQUBE FIX: Reused freeTimeSlots method to eliminate duplicate logic
        freeTimeSlots(booking.getTimeSlotIds());

        // 3. SMART LOGGING: Scream if a paid booking gets deleted
        if (booking.getTotalAmount() != null && booking.getTotalAmount().doubleValue() > 0) {
            log.warn("FINANCE AUDIT: PAID Booking ID {} was cancelled via patch endpoint.", id);
        }

        // ==========================================
        // Trigger the Cancellation Emails!
        // ==========================================
        triggerStatusChangeEmails(savedBooking, true);
    }

    // ==========================================
    // Admin Dashboard Summary
    // ==========================================
    @Transactional(readOnly = true)
    public Map<String, Object> getBookingSummary() {
        long total = bookingRepository.count();
        long pending = bookingRepository.countByBookingStatus(BookingStatus.PENDING);
        long confirmed = bookingRepository.countByBookingStatus(BookingStatus.CONFIRMED);
        long completed = bookingRepository.countByBookingStatus(BookingStatus.COMPLETED);
        BigDecimal revenue = bookingRepository.calculateTotalRevenue();

        return Map.of("total", total, "pending", pending, "confirmed", confirmed, KEY_COMPLETED, completed, "revenue", revenue);
    }

    // ==========================================
    // 📊 DASHBOARD: BOOKINGS & REVENUE (TAB 6)
    // ==========================================
    public Map<String, Object> getRevenueAnalytics(int days) {
        LocalDateTime startDate = LocalDateTime.now().minusDays(days);

        List<BookingRepository.BookingRevenueData> rawData = bookingRepository.getBookingRevenueByConsultant(startDate);

        long totalBookings = rawData.stream().mapToLong(BookingRepository.BookingRevenueData::getTotalBookings).sum();
        long completed = rawData.stream().mapToLong(BookingRepository.BookingRevenueData::getCompletedBookings).sum();
        BigDecimal totalRevenue = rawData.stream().map(d -> d.getTotalRevenue() != null ? d.getTotalRevenue() : BigDecimal.ZERO).reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Map<String, Object>> tableData = rawData.stream().map(d -> {
            Map<String, Object> map = new HashMap<>();
            map.put("consultantId", d.getConsultantId());
            map.put("bookings", d.getTotalBookings());
            map.put(KEY_COMPLETED, d.getCompletedBookings());
            map.put("revenue", d.getTotalRevenue() != null ? d.getTotalRevenue() : 0);
            return map;
        }).toList();

        return Map.of("totalBookings", totalBookings, KEY_COMPLETED, completed, "totalRevenue", totalRevenue, "tableData", tableData);
    }

    private BookingResponse mapToResponse(Booking booking) {
        // Parse the string back into a List of Longs
        List<Long> parsedSlotIds = Arrays.stream(booking.getTimeSlotIds().split(","))
                .map(String::trim)
                .map(Long::valueOf)
                .toList();

        return BookingResponse.builder()
                .id(booking.getId())
                .userId(booking.getUserId())
                .consultantId(booking.getConsultantId())
                .timeSlotIds(parsedSlotIds)
                //.baseAmount(booking.getBaseAmount())
                //.additionalCharges(booking.getAdditionalCharges())
                .totalAmount(booking.getTotalAmount())
                .discountAmount(booking.getDiscountAmount())
                .offerId(booking.getOfferId())
                .bookingStatus(booking.getBookingStatus())
                .paymentStatus(booking.getPaymentStatus())
                .meetingMode(booking.getMeetingMode())
                .meetingLink(booking.getMeetingLink())
                .meetingId(booking.getMeetingId())
                .meetingNotes(booking.getMeetingNotes())
                .userNotes(booking.getUserNotes())
                .version(booking.getVersion())
                .build();
    }

    private BigDecimal calculateDiscountAmount(Long offerId, BigDecimal baseAmount, Long userId) {
        if (offerId == null) {
            return BigDecimal.ZERO;
        }

        boolean alreadyUsed = bookingRepository.existsByUserIdAndOfferIdAndBookingStatusNot(
                userId, offerId, BookingStatus.CANCELLED
        );
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
}