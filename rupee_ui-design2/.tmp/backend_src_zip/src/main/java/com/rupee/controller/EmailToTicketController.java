package com.rupee.controller;

import com.rupee.service.EmailToTicketService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/api/email-to-ticket")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class EmailToTicketController {

    private final EmailToTicketService emailToTicketService;

    /**
     * Manually trigger email polling (Admin only)
     * Useful for testing and emergency processing
     */
    @PostMapping("/poll")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<String> triggerEmailPolling() {
        log.info("Admin triggered manual email polling");
        try {
            emailToTicketService.pollAndProcessEmails();
            return ResponseEntity.ok("Email polling initiated successfully");
        } catch (Exception e) {
            log.error("Error during manual email polling: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body("Error during email polling: " + e.getMessage());
        }
    }

    /**
     * Health check endpoint for email processing
     */
    @GetMapping("/health")
    public ResponseEntity<String> emailProcessingHealth() {
        return ResponseEntity.ok("Email-to-Ticket service is running");
    }
}

