package com.rupee.controller;

import com.rupee.dto.request.TicketCommentRequest;
import com.rupee.dto.request.TicketEscalationRequest;
import com.rupee.dto.request.TicketNoteRequest;
import com.rupee.dto.request.TicketRequest;
import com.rupee.dto.response.TicketCommentResponse;
import com.rupee.dto.response.TicketNoteResponse;
import com.rupee.dto.response.TicketResponse;
import com.rupee.enums.TicketEnums.Status;
import com.rupee.enums.TicketEnums.Priority;
import com.rupee.service.TicketService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@CrossOrigin(origins = "*") // ✅ Prevents CORS issues on the frontend
@RestController
@RequestMapping("/api/tickets")
@RequiredArgsConstructor
public class TicketController {

    private final TicketService ticketService;

    // --- 1. CORE TICKET ENDPOINTS ---

    // ✅ NEW: Populates the Frontend dropdown dynamically based on existing records
    @GetMapping("/unique-categories")
    public ResponseEntity<List<String>> getUniqueCategories() {
        return ResponseEntity.ok(ticketService.getUniqueCategories());
    }

    // ✅ SECURED: Admins, Subscribers, Members, and Guests can raise tickets.
    @PreAuthorize("hasAnyRole('ADMIN', 'SUBSCRIBER', 'MEMBER', 'GUEST')") // <-- ADDED ADMIN HERE
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<TicketResponse> createTicket(
            @Valid @RequestPart("ticketData") TicketRequest request,
            @RequestPart(value = "file", required = false) MultipartFile file) {
        return new ResponseEntity<>(ticketService.createTicket(request, file), HttpStatus.CREATED);
    }

    // Paginated with a default sort of newest-first
    @GetMapping
    public ResponseEntity<Page<TicketResponse>> getAllTickets(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "createdAt") String sortBy) {

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, sortBy));
        return ResponseEntity.ok(ticketService.getAllTickets(pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<TicketResponse> getTicketById(@PathVariable Long id) {
        return ResponseEntity.ok(ticketService.getTicketById(id));
    }

    // Paginated with a default sort of newest-first
    @GetMapping("/user/{userId}")
    public ResponseEntity<Page<TicketResponse>> getTicketsByUser(
            @PathVariable Long userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "createdAt") String sortBy) {

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, sortBy));
        return ResponseEntity.ok(ticketService.getTicketsByUser(userId, pageable));
    }

    // Paginated with a default sort of newest-first
    @GetMapping("/consultant/{consultantId}")
    public ResponseEntity<Page<TicketResponse>> getTicketsByConsultant(
            @PathVariable Long consultantId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "createdAt") String sortBy) {

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, sortBy));
        return ResponseEntity.ok(ticketService.getTicketsByConsultant(consultantId, pageable));
    }

    // --- 2. ASSIGNMENT & STATUS UPDATES ---

    // ✅ ADDED Security: Only Admins should manually assign tickets

    @PutMapping("/{id}/assign")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<TicketResponse> assignTicket(
            @PathVariable Long id, 
            @RequestBody Map<String, Object> payload) {
        
        Object consultantIdObj = payload.get("consultantId");
        if (consultantIdObj == null) {
            throw new IllegalArgumentException("Consultant ID is required in the request body.");
        }
        return ResponseEntity.ok(ticketService.assignConsultant(id, Long.valueOf(consultantIdObj.toString())));
    }

    // ✅ NEW: Admin Dashboard SLA view
    @GetMapping("/sla-breached")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<TicketResponse>> getSlaBreachedTickets() {
        return ResponseEntity.ok(ticketService.getSlaBreachedTickets());
    }

    // Added "/status" back to match the frontend!
    // Changed @RequestBody to @RequestParam to match Frontend Strategy 1
    @PatchMapping("/{id}/status")
    public ResponseEntity<TicketResponse> updateTicketStatus(
            @PathVariable Long id,
            @RequestParam String status) { // Now expects ?status=VALUE in the URL

        if (status == null || status.trim().isEmpty()) {
            throw new IllegalArgumentException("Status parameter is missing in the request.");
        }

        try {
            return ResponseEntity.ok(ticketService.updateTicketStatus(id, Status.valueOf(status.toUpperCase())));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid status provided. Allowed values are: NEW, OPEN, PENDING, RESOLVED, CLOSED");
        }
    }

    // --- 2. ASSIGNMENT & STATUS UPDATES ---

    // ✅ NEW: Endpoint to update priority with Admin downgrade protection
    @PatchMapping("/{id}/priority")
    public ResponseEntity<TicketResponse> updateTicketPriority(
            @PathVariable Long id,
            @RequestBody Map<String, String> payload) {

        String priorityString = payload.get("priority");
        if (priorityString == null || priorityString.trim().isEmpty()) {
            throw new IllegalArgumentException("Priority field is missing in the request body.");
        }

        try {
            return ResponseEntity.ok(ticketService.updateTicketPriority(id, Priority.valueOf(priorityString.toUpperCase())));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid priority provided. Allowed values are: LOW, MEDIUM, HIGH, CRITICAL");
        }
    }

    // --- 3. FEEDBACK & DELETION ---

    // ✅ FIXED: Added "/feedback" to path and changed payload key to "rating" to match frontend JSON
    @PostMapping("/{id}/feedback")
    public ResponseEntity<TicketResponse> submitFeedback(
            @PathVariable Long id, 
            @RequestBody Map<String, Object> payload) {
        try {
            Integer rating = payload.get("feedbackRating") != null 
                ? Integer.parseInt(payload.get("feedbackRating").toString()) 
                : null;
            return ResponseEntity.ok(ticketService.submitFeedback(id, rating, (String) payload.getOrDefault("feedbackText", "")));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid feedback rating format.");
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTicket(@PathVariable Long id) {
        ticketService.deleteTicket(id);
        return ResponseEntity.noContent().build();
    }

    // --- 4. COMMENTS & INTERNAL NOTES ---

    @PostMapping("/comments")
    public ResponseEntity<TicketCommentResponse> addComment(@Valid @RequestBody TicketCommentRequest request) {
        return new ResponseEntity<>(ticketService.addComment(request), HttpStatus.CREATED);
    }

    @GetMapping("/{ticketId}/comments")
    public ResponseEntity<List<TicketCommentResponse>> getTicketThread(@PathVariable Long ticketId) {
        return ResponseEntity.ok(ticketService.getTicketThread(ticketId));
    }

    @PostMapping("/{id}/notes")
    public ResponseEntity<TicketNoteResponse> addInternalNote(
            @PathVariable Long id, 
            @Valid @RequestBody TicketNoteRequest request) {
        return new ResponseEntity<>(ticketService.addInternalNote(id, request), HttpStatus.CREATED);
    }

    // ✅ STRICT SECURITY: Only Consultants and Admins can view internal agent notes
    @GetMapping("/{id}/notes")
    @PreAuthorize("hasAnyRole('CONSULTANT', 'ADMIN')")
    public ResponseEntity<List<TicketNoteResponse>> getInternalNotes(@PathVariable Long id) {
        return ResponseEntity.ok(ticketService.getInternalNotes(id));
    }

    // --- 5. ESCALATION ENDPOINTS ---

    // ✅ STRICT SECURITY: Normal users cannot manually escalate tickets
    @PreAuthorize("hasAnyRole('ADMIN', 'CONSULTANT')")
    @PostMapping("/{id}/escalate")
    public ResponseEntity<TicketResponse> escalateTicket(
            @PathVariable Long id,
            @Valid @RequestBody TicketEscalationRequest request) {
        return ResponseEntity.ok(ticketService.escalateTicket(id, request));
    }

    @GetMapping("/escalated")
    public ResponseEntity<List<TicketResponse>> getEscalatedTickets() {
        return ResponseEntity.ok(ticketService.getEscalatedTickets());
    }

    // ✅ NEW: Admin Dashboard Summary Endpoint
    @GetMapping("/summary")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> getTicketSummary() {
        return ResponseEntity.ok(ticketService.getTicketSummary());
    }
}