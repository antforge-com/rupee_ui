package com.rupee.controller;

import com.rupee.dto.request.GiveSlotRequest;
import com.rupee.dto.request.SpecialBookingRequest;
import com.rupee.dto.request.RescheduleSpecialBookingRequest; // ✅ ADDED
import com.rupee.dto.response.SpecialBookingResponse;
import com.rupee.service.SpecialBookingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/special-bookings")
@RequiredArgsConstructor
public class SpecialBookingController {

    private final SpecialBookingService specialBookingService;

    // User creates a pre-paid request
    @PostMapping
    public ResponseEntity<SpecialBookingResponse> createSpecialBooking(@Valid @RequestBody SpecialBookingRequest request) {
        return new ResponseEntity<>(specialBookingService.createSpecialBooking(request), HttpStatus.CREATED);
    }

    // User views their own requests
    @GetMapping("/me")
    public ResponseEntity<Page<SpecialBookingResponse>> getMySpecialBookings(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(specialBookingService.getMySpecialBookings(page, size));
    }

    // Admin views all requests (Keep ADMIN here so they can monitor the system)
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Page<SpecialBookingResponse>> getAllSpecialBookings(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(specialBookingService.getAllSpecialBookings(page, size));
    }

    // ✅ STRICT: Only the Consultant can assign the time/link
    @PatchMapping("/{id}/give-slot")
    @PreAuthorize("hasRole('CONSULTANT')")
    public ResponseEntity<SpecialBookingResponse> giveSlot(
            @PathVariable Long id,
            @Valid @RequestBody GiveSlotRequest request) {
        return ResponseEntity.ok(specialBookingService.giveSlot(id, request));
    }

    // ✅ NEW: Safe Reschedule Endpoint
    @PutMapping("/{id}/reschedule")
    public ResponseEntity<SpecialBookingResponse> rescheduleSpecialBooking(
            @PathVariable Long id,
            @Valid @RequestBody RescheduleSpecialBookingRequest request) {
        return ResponseEntity.ok(specialBookingService.rescheduleSpecialBooking(id, request));
    }

    // ✅ STRICT: Only the Consultant can view their assigned list
    @GetMapping("/consultant/{consultantId}")
    @PreAuthorize("hasRole('CONSULTANT')")
    public ResponseEntity<Page<SpecialBookingResponse>> getConsultantSpecialBookings(
            @PathVariable Long consultantId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(specialBookingService.getConsultantSpecialBookings(consultantId, page, size));
    }
}