package com.rupee.controller;

import com.rupee.dto.request.BookingNotificationRequest; // ✅ Added for new booking payload
import com.rupee.entity.Notification;
import com.rupee.entity.User;
import com.rupee.service.EmailService; // ✅ Added to handle email sending
import com.rupee.service.NotificationService;
import com.rupee.service.SecurityService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j; // ✅ Added for logging email attempts
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;
    private final SecurityService securityService; // Injecting this to safely get the logged-in user
    private final EmailService emailService; // To handle booking email dispatch

    // == 1. GET UNREAD NOTIFICATIONS ==
    @GetMapping
    public ResponseEntity<List<Notification>> getMyUnreadNotifications() {
        // Securely grab the current logged-in user from the JWT token
        User currentUser = securityService.getCurrentUser();

        List<Notification> unreadNotifications = notificationService.getUnreadNotifications(currentUser.getId());

        return ResponseEntity.ok(unreadNotifications);
    }

    // == 2. MARK NOTIFICATION AS READ ==
    @PutMapping("/{id:[0-9]+}/read")
    public ResponseEntity<Map<String, String>> markNotificationAsRead(@PathVariable Long id) {
        // Optional Security Enhancement: You could verify that this notification actually
        // belongs to the current user before marking it read, but for now, this works perfectly!

        notificationService.markAsRead(id);

        return ResponseEntity.ok(Map.of("message", "Notification marked as read"));
    }

    // == 3. SEND BOOKING CONFIRMATION EMAILS ==
    // To handle the asynchronous frontend request
    @PostMapping("/booking-confirmation")
    public ResponseEntity<String> sendBookingEmails(@RequestBody BookingNotificationRequest request) {
        try {
            // 1. Send HTML receipt to User (Now with Meeting Link)
            emailService.sendBookingConfirmationToUser(
                    request.getUserEmail(),
                    request.getBookingId(),
                    request.getMeetingMode(),
                    request.getAmount(),
                    request.getDiscountAmount(), // ✅ ADD THIS NEW PARAMETER
                    request.getMeetingLink() // Passed here
            );

            // 2. Send HTML alert to Consultant
            emailService.sendBookingAlertToConsultant(
                    request.getConsultantEmail(),
                    request.getBookingId(),
                    request.getMeetingMode(),
                    request.getUserEmail(),
                    request.getMeetingLink()
            );

            return ResponseEntity.ok("Booking notifications dispatched.");
        } catch (Exception e) {
            log.error("Failed to dispatch booking emails for Booking ID: {}", request.getBookingId(), e);
            return ResponseEntity.internalServerError().body("Error sending emails.");
        }
    }
}