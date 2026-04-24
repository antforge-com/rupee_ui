package com.rupee.controller;

import com.rupee.dto.request.*;
import com.rupee.dto.response.BookingResponse;
import com.rupee.dto.response.BulkBookingResponse;
import com.rupee.enums.BookingEnums.BookingStatus;
import com.rupee.service.BookingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/bookings")
@RequiredArgsConstructor
public class BookingController {

    private final BookingService bookingService;

    @PostMapping
    public ResponseEntity<BookingResponse> createBooking(@Valid @RequestBody BookingRequest request) {
        return new ResponseEntity<>(bookingService.createBooking(request), HttpStatus.CREATED);
    }

    @PostMapping("/bulk")
    public ResponseEntity<BulkBookingResponse> createBulkBooking(@Valid @RequestBody BulkBookingRequest request) {
        return new ResponseEntity<>(bookingService.createBulkBooking(request), HttpStatus.CREATED);
    }

    @GetMapping("/{id}")
    public ResponseEntity<BookingResponse> getBookingById(@PathVariable Long id) {
        return ResponseEntity.ok(bookingService.getBookingById(id));
    }

    @GetMapping("/status/{status}")
    public ResponseEntity<Page<BookingResponse>> getBookingsByStatus(
            @PathVariable BookingStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(bookingService.getBookingsByStatus(status, page, size));
    }

    @GetMapping("/me")
    public ResponseEntity<Page<BookingResponse>> getMyBookings(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(bookingService.getMyBookings(page, size));
    }

    @GetMapping("/consultant/{consultantId}")
    public ResponseEntity<Page<BookingResponse>> getConsultantBookings(
            @PathVariable Long consultantId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(bookingService.getConsultantBookings(consultantId, page, size));
    }

    @GetMapping
    public ResponseEntity<Page<BookingResponse>> getAllBookings(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(bookingService.getAllBookings(page, size));
    }

    @PutMapping("/{id}")
    public ResponseEntity<BookingResponse> updateBooking(
            @PathVariable Long id,
            @Valid @RequestBody BookingUpdateRequest request) {
        return ResponseEntity.ok(bookingService.updateBooking(id, request));
    }

    // ✅ NEW: Bulk Update API
    @PutMapping("/bulk/{id}")
    public ResponseEntity<BookingResponse> updateBulkBooking(
            @PathVariable Long id,
            @Valid @RequestBody BulkBookingUpdateRequest request) {
        return ResponseEntity.ok(bookingService.updateBulkBooking(id, request));
    }

    // ✅ NEW: Safe Reschedule Endpoint
    @PutMapping("/{id}/reschedule")
    public ResponseEntity<BookingResponse> rescheduleBooking(
            @PathVariable Long id,
            @Valid @RequestBody RescheduleBookingRequest request) {
        return ResponseEntity.ok(bookingService.rescheduleBooking(id, request));
    }

    // 2. ✅ NEW: Bulk Reschedule
    @PutMapping("/bulk/{id}/reschedule")
    public ResponseEntity<BookingResponse> rescheduleBulkBooking(
            @PathVariable Long id,
            @Valid @RequestBody RescheduleBulkBookingRequest request) {
        return ResponseEntity.ok(bookingService.rescheduleBulkBooking(id, request));
    }

    @PatchMapping("/{id}/cancel")
    public ResponseEntity<Void> cancelBooking(@PathVariable Long id) {
        bookingService.cancelBooking(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/summary")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> getBookingSummary() {
        return ResponseEntity.ok(bookingService.getBookingSummary());
    }
}