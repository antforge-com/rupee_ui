package com.rupee.controller;

import com.rupee.dto.request.ContactMessageRequest;
import com.rupee.dto.response.ContactMessageResponse;
import com.rupee.service.ContactMessageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/contact")
@RequiredArgsConstructor
public class ContactMessageController {

    private final ContactMessageService contactMessageService;

    // ==========================================
    // 🌍 PUBLIC ENDPOINT (No Auth Required)
    // ==========================================
    @PostMapping("/public/submit")
    public ResponseEntity<Void> submitContactMessage(@Valid @RequestBody ContactMessageRequest request) {
        contactMessageService.saveMessage(request);
        return new ResponseEntity<>(HttpStatus.CREATED); // Returns a 201 Created
    }

    // ==========================================
    // 🛡️ ADMIN ENDPOINTS (Secured)
    // ==========================================
    @GetMapping("/admin/messages")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Page<ContactMessageResponse>> getAllMessages(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        // Sorts by newest first
        return ResponseEntity.ok(contactMessageService.getAllMessages(
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"))
        ));
    }

    @PatchMapping("/admin/messages/{id}/read")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ContactMessageResponse> markMessageAsRead(@PathVariable Long id) {
        return ResponseEntity.ok(contactMessageService.markAsRead(id));
    }
}