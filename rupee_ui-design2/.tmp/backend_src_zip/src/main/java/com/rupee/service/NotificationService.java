package com.rupee.service;

import com.rupee.entity.Notification;
import com.rupee.entity.User;
import com.rupee.enums.NotificationType;
import com.rupee.enums.UserEnums.*;
import com.rupee.repository.NotificationRepository;
import com.rupee.repository.UserRepository;
import jakarta.mail.MessagingException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;

    // INJECTIONS for Dual Notification (In-App + Email)
    private final EmailService emailService;
    private final UserRepository userRepository;

    // Defined constants to prevent magic string duplication
    private static final String UNKNOWN_USER = "Unknown User";
    private static final String UNKNOWN_CONSULTANT = "Unknown Consultant";
    private static final String TICKET_NA = "N/A";

    private static final String SUCCESS_MSG_SUFFIX = ") has been successfully ";
    private static final String RESCHEDULED_BY_PREFIX = "rescheduled by ";
    private static final String BOOKING_ID_PREFIX = " (Booking #";

    // ✅ SONARQUBE FIX: Dedicated Record to group Special Booking parameters
    public record SpecialBookingEventData(
            Long userId,
            Long consultantId,
            Long bookingId,
            int hours,
            String meetingMode,
            String date,
            String time,
            String userNotes,
            String meetingLink
    ) {}

    // --- HELPER METHODS FOR DYNAMIC TEXT ---
    private String buildUserBookingMessage(Long bookingId, String meetingMode, boolean isReschedule) {
        String action = isReschedule ? "rescheduled" : "confirmed";
        if ("PHONE".equalsIgnoreCase(meetingMode)) {
            return "Your Phone Consultation (#" + bookingId + SUCCESS_MSG_SUFFIX + action + ". The consultant will call you.";
        } else if ("PHYSICAL".equalsIgnoreCase(meetingMode)) {
            return "Your In-Person booking (#" + bookingId + SUCCESS_MSG_SUFFIX + action + ". The consultant will call you in advance to provide the exact location details.";
        } else {
            return "Your Online booking (#" + bookingId + SUCCESS_MSG_SUFFIX + action + ".";
        }
    }

    private String buildConsultantBookingMessage(Long bookingId, String meetingMode, String clientEmail, boolean isReschedule) {
        if ("PHONE".equalsIgnoreCase(meetingMode)) {
            return "Phone Consultation " + (isReschedule ? RESCHEDULED_BY_PREFIX : "requested by ") + clientEmail + BOOKING_ID_PREFIX + bookingId + ").";
        } else if ("PHYSICAL".equalsIgnoreCase(meetingMode)) {
            return "In-Person Appointment " + (isReschedule ? RESCHEDULED_BY_PREFIX : "from ") + clientEmail + BOOKING_ID_PREFIX + bookingId + "). Remember to call the client in advance to provide location details.";
        } else {
            return "Online Appointment " + (isReschedule ? RESCHEDULED_BY_PREFIX : "from ") + clientEmail + BOOKING_ID_PREFIX + bookingId + ").";
        }
    }

    // REMOVED TicketRepository and the @Scheduled job.
    // TicketService now handles SLA tracking and will call these methods when needed!


    // --- NOTIFICATION TRIGGERS ---

    @Transactional
    public void notifyTicketCreated(Long userId, Long ticketId, String ticketNumber, String category, Long consultantId) {
        // 1. Notify User (Notif + Email)
        String message = "Your ticket #" + ticketNumber + " has been successfully created.";
        processNotification(userId, ticketId, message, NotificationType.NEW_TICKET,
                email -> emailService.sendTicketCreatedEmail(email, ticketNumber, category));

        // 2. Notify Admins ONLY if nobody is currently assigned to this category/ticket
        if (consultantId == null) {
            String adminMessage = "New unassigned ticket #" + ticketNumber + " created in category: " + category;
            userRepository.findByRole(Role.ADMIN).forEach(admin ->
                    processNotification(admin.getId(), ticketId, adminMessage, NotificationType.NEW_TICKET,
                            email -> emailService.sendSystemNotification(email, adminMessage))
            );
        }
    }

    // UPDATED
    @Transactional
    public void notifyTicketUpdate(Long customerId, Long ticketId, String ticketNumber, String status) {
        String message = "Your ticket #" + ticketNumber + " has been updated to: " + status;
        processNotification(customerId, ticketId, message, NotificationType.TICKET_UPDATED,
                email -> emailService.sendTicketUpdatedEmail(email, ticketNumber, status));
    }

    // UPDATED
    @Transactional
    public void notifyNewAssignment(Long consultantId, Long ticketId, String ticketNumber) {
        String message = "You have been assigned a new ticket: #" + ticketNumber;
        processNotification(consultantId, ticketId, message, NotificationType.NEW_ASSIGNMENT,
                email -> emailService.sendTicketAssignedEmail(email, ticketNumber));
    }

    // UPDATED
    @Transactional
    public void notifyEscalation(Long userId, Long ticketId, String ticketNumber, String reason) {
        String message = "ESCALATION: Ticket #" + ticketNumber + " has been escalated! Reason: " + reason;
        processNotification(userId, ticketId, message, NotificationType.ESCALATION,
                email -> emailService.sendSystemNotification(email, message));
    }

    // Refactored to reduce Cognitive Complexity below 15
    @Transactional
    public void notifyManualEscalation(Long userId, Long consultantId, Long ticketId, String ticketNumber, String reason, String role) {
        String baseMessage = "ESCALATION: Ticket #" + ticketNumber + " has been escalated! Reason: " + reason;

        if ("ADMIN".equals(role)) {
            handleAdminEscalation(userId, consultantId, ticketId, baseMessage);
        } else if ("CONSULTANT".equals(role)) {
            handleConsultantEscalation(ticketId, ticketNumber, reason);
        } else {
            handleUnknownRoleEscalation(ticketId, ticketNumber, reason, role);
        }
    }

    private void handleAdminEscalation(Long userId, Long consultantId, Long ticketId, String baseMessage) {
        // IF ADMIN ESCALATED: Notify the User and Consultant
        processNotification(userId, ticketId, baseMessage, NotificationType.ESCALATION,
                email -> emailService.sendSystemNotification(email, baseMessage));

        if (consultantId != null) {
            processNotification(consultantId, ticketId, baseMessage, NotificationType.ESCALATION,
                    email -> emailService.sendSystemNotification(email, baseMessage));
        }
    }

    private void handleConsultantEscalation(Long ticketId, String ticketNumber, String reason) {
        // IF CONSULTANT ESCALATED: Notify the Admins only (NO EMAIL, IN-APP NOTIFICATION ONLY)
        String adminMessage = "ADMIN ALERT: Consultant escalated Ticket #" + ticketNumber + "! Reason: " + reason;
        userRepository.findByRole(Role.ADMIN).forEach(admin ->
                processNotificationWithoutEmail(admin.getId(), ticketId, adminMessage, NotificationType.ESCALATION)
        );
    }

    private void handleUnknownRoleEscalation(Long ticketId, String ticketNumber, String reason, String role) {
        // FALLBACK: Just in case an unknown role slips through
        log.warn("Unknown role '{}' triggered an escalation for ticket #{}", role, ticketNumber);
        String adminMessage = "ADMIN ALERT: Unknown role (" + role + ") escalated Ticket #" + ticketNumber + "! Reason: " + reason;
        userRepository.findByRole(Role.ADMIN).forEach(admin ->
                processNotification(admin.getId(), ticketId, adminMessage, NotificationType.ESCALATION,
                        email -> emailService.sendSystemNotification(email, adminMessage))
        );
    }

    // UPDATED: Comments only trigger in-app notifications, NO EMAILS
    @Transactional
    public void notifyNewComment(Long recipientId, Long ticketId, String ticketNumber) {
        String message = "You have a new message on Ticket #" + ticketNumber;
        processNotificationWithoutEmail(recipientId, ticketId, message, NotificationType.TICKET_UPDATED);
    }

    // ==========================================
    // 📅 NORMAL BOOKING NOTIFICATIONS
    // ==========================================
    @Transactional
    public void notifyNormalBookingCreated(Long userId, Long consultantId, Long bookingId, String meetingMode, String amountStr, String discountStr, String meetingLink) {
        String clientEmail = userRepository.findById(userId).map(User::getIdentifier).orElse(UNKNOWN_USER);

        // 1. Notify User (In-App + Email)
        String userMessage = buildUserBookingMessage(bookingId, meetingMode, false);
        processNotification(userId, null, userMessage, NotificationType.NEW_BOOKING,
                email -> emailService.sendBookingConfirmationToUser(email, bookingId, meetingMode, amountStr, discountStr, meetingLink));

        // 2. Notify Consultant (In-App + Email)
        String consultantMessage = buildConsultantBookingMessage(bookingId, meetingMode, clientEmail, false);
        processNotification(consultantId, null, consultantMessage, NotificationType.NEW_BOOKING,
                email -> emailService.sendBookingAlertToConsultant(email, bookingId, meetingMode, clientEmail, meetingLink));
    }

    // Notify for Normal Booking Reschedules
    @Transactional
    public void notifyNormalBookingRescheduled(Long userId, Long consultantId, Long bookingId, String meetingMode, String meetingLink) {
        String clientEmail = userRepository.findById(userId).map(User::getIdentifier).orElse(UNKNOWN_USER);

        String userMessage = buildUserBookingMessage(bookingId, meetingMode, true);
        processNotification(userId, null, userMessage, NotificationType.BOOKING_UPDATED,
                email -> emailService.sendNormalBookingRescheduledToUser(email, bookingId, meetingMode, meetingLink));

        String consultantMessage = buildConsultantBookingMessage(bookingId, meetingMode, clientEmail, true);
        processNotification(consultantId, null, consultantMessage, NotificationType.BOOKING_UPDATED,
                email -> emailService.sendNormalBookingRescheduledAlertToConsultant(email, bookingId, meetingMode, clientEmail, meetingLink));
    }

    // ==========================================
    // 📅 SPECIAL BOOKING NOTIFICATIONS
    // ==========================================

    // Utilizing SpecialBookingEventData to resolve > 7 parameter violation
    @Transactional
    public void notifySpecialBookingRequested(SpecialBookingEventData data) {
        // Fetch emails cleanly to inject into the templates
        String clientEmail = userRepository.findById(data.userId()).map(User::getIdentifier).orElse(UNKNOWN_USER);
        String consultantEmail = userRepository.findById(data.consultantId()).map(User::getIdentifier).orElse(UNKNOWN_CONSULTANT);

        // 1. Notify Consultant (In-App + Email)
        String consultantMessage = "Action Required: You have a new Special Booking request from " + clientEmail + BOOKING_ID_PREFIX + data.bookingId() + ").";
        processNotification(data.consultantId(), null, consultantMessage, NotificationType.NEW_BOOKING,
                email -> emailService.sendSpecialBookingRequestToConsultant(email, data.bookingId(), data.hours(), clientEmail, data.meetingMode(), data.userNotes()));

        // 2. Notify User (In-App + Email)
        String userMessage = "Your Special Booking request (ID: #" + data.bookingId() + ") has been sent to the consultant.";
        processNotification(data.userId(), null, userMessage, NotificationType.NEW_BOOKING,
                email -> emailService.sendSpecialBookingRequestToUser(email, data.bookingId(), data.hours(), consultantEmail, data.meetingMode()));
    }

    // Utilizing SpecialBookingEventData to resolve > 7 parameter violation
    @Transactional
    public void notifySpecialBookingConfirmed(SpecialBookingEventData data) {
        String clientEmail = userRepository.findById(data.userId()).map(User::getIdentifier).orElse(UNKNOWN_USER);
        String consultantEmail = userRepository.findById(data.consultantId()).map(User::getIdentifier).orElse(UNKNOWN_CONSULTANT);

        // 1. Notify User (In-App + Email)
        String userMessage = buildUserBookingMessage(data.bookingId(), data.meetingMode(), false);
        processNotification(data.userId(), null, userMessage, NotificationType.BOOKING_UPDATED,
                email -> emailService.sendSpecialBookingConfirmedToUser(email,
                        new EmailService.SpecialBookingEmailData(data.bookingId(), data.date(), data.time(), data.hours(), data.meetingMode(), data.meetingLink(), consultantEmail)));

        // 2. Notify Consultant (In-App + Email)
        String consultantMessage = buildConsultantBookingMessage(data.bookingId(), data.meetingMode(), clientEmail, false);
        processNotification(data.consultantId(), null, consultantMessage, NotificationType.BOOKING_UPDATED,
                email -> emailService.sendSpecialBookingConfirmedToConsultant(email,
                        new EmailService.SpecialBookingEmailData(data.bookingId(), data.date(), data.time(), data.hours(), data.meetingMode(), data.meetingLink(), clientEmail)));
    }

    // Utilizing SpecialBookingEventData to resolve > 7 parameter violation
    @Transactional
    public void notifySpecialBookingRescheduled(SpecialBookingEventData data) {
        String clientEmail = userRepository.findById(data.userId()).map(User::getIdentifier).orElse(UNKNOWN_USER);
        String consultantEmail = userRepository.findById(data.consultantId()).map(User::getIdentifier).orElse(UNKNOWN_CONSULTANT);

        String userMessage = buildUserBookingMessage(data.bookingId(), data.meetingMode(), true);
        processNotification(data.userId(), null, userMessage, NotificationType.BOOKING_UPDATED,
                email -> emailService.sendSpecialBookingRescheduledToUser(email,
                        new EmailService.SpecialBookingEmailData(data.bookingId(), data.date(), data.time(), data.hours(), data.meetingMode(), data.meetingLink(), consultantEmail)));

        String consultantMessage = buildConsultantBookingMessage(data.bookingId(), data.meetingMode(), clientEmail, true);
        processNotification(data.consultantId(), null, consultantMessage, NotificationType.BOOKING_UPDATED,
                email -> emailService.sendSpecialBookingRescheduledToConsultant(email,
                        new EmailService.SpecialBookingEmailData(data.bookingId(), data.date(), data.time(), data.hours(), data.meetingMode(), data.meetingLink(), clientEmail)));
    }

    // --- CENTRALIZED ENGINE ---

    /**
     * Master method to handle both DB saving and async-safe email delivery.
     * Keeps our public trigger methods completely DRY.
     */
    // PUBLIC so BookingService can call it directly for cancellations!
    public void processNotification(Long userId, Long ticketId, String message, NotificationType type, EmailAction emailAction) {
        String ticketIdStr = (ticketId != null) ? ticketId.toString() : TICKET_NA;

        if (userId == null) {
            // Logged as a warning instead of throwing an exception.
            // We don't want a missing user ID to completely abort a successful ticket creation/update!
            log.warn("Cannot process notification: User ID is null for Ticket ID {}", ticketIdStr);
            return;
        }

        // 1. Save IN-APP Notification to Database (Uses the raw ticketId)
        Notification notification = new Notification(null, userId, ticketId, message, type, false, LocalDateTime.now());
        try {
            notificationRepository.save(notification);
        } catch (Exception e) {
            // Critical DB failure log
            log.error("Failed to save in-app notification for user {} on ticket {}", userId, ticketIdStr, e);
        }

        // Extracted the heavy nested try-catch logic into a separate method
        userRepository.findById(userId).ifPresent(user ->
                triggerEmailDispatch(user, userId, ticketIdStr, message, type, emailAction)
        );
    }

    // Separated email trigger logic to drastically reduce cognitive complexity
    private void triggerEmailDispatch(User user, Long userId, String ticketIdStr, String message, NotificationType type, EmailAction emailAction) {
        try {
            emailAction.send(user.getIdentifier());

            log.info("SUCCESS: Email sent. Recipient: {} (User ID: {}) | Action: {} | Ticket ID: {} | Message: '{}'",
                    user.getIdentifier(), userId, type.name(), ticketIdStr, message);

        } catch (MessagingException e) {
            log.error("FAILED: SMTP/Email error. Recipient: {} (User ID: {}) | Action: {} | Ticket ID: {} | Error: {}",
                    user.getIdentifier(), userId, type.name(), ticketIdStr, e.getMessage());
        } catch (Exception e) {
            log.error("FAILED: Unexpected error sending email. Recipient: {} (User ID: {}) | Action: {} | Ticket ID: {}",
                    user.getIdentifier(), userId, type.name(), ticketIdStr, e);
        }
    }

    /**
     * Saves IN-APP Notification to Database WITHOUT sending an email.
     * Used for high-frequency events like comments to prevent email spam.
     */
    private void processNotificationWithoutEmail(Long userId, Long ticketId, String message, NotificationType type) {
        if (userId == null) return;

        Notification notification = new Notification(null, userId, ticketId, message, type, false, LocalDateTime.now());
        try {
            notificationRepository.save(notification);
        } catch (Exception e) {
            log.error("Failed to save in-app notification for user {} on ticket {}", userId, (ticketId != null ? ticketId.toString() : TICKET_NA), e);
        }
    }

    /**
     * Refactored Functional Interface
     * Now strictly enforces MessagingException to match our EmailService signatures.
     * PUBLIC so BookingService can pass lambdas into processNotification!
     */
    @FunctionalInterface
    public interface EmailAction {
        void send(String email) throws MessagingException;
    }

    // --- FETCH & UPDATE LOGIC ---

    public List<Notification> getUnreadNotifications(Long userId) {
        return notificationRepository.findByUserIdAndIsReadFalseOrderByCreatedAtDesc(userId);
    }

    @Transactional
    public void markAsRead(Long notificationId) {
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new IllegalArgumentException("Notification not found with ID: " + notificationId));

        notification.setRead(true);
        notificationRepository.save(notification);
    }
}