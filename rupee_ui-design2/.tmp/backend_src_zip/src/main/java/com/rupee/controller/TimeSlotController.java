package com.rupee.controller;

import com.rupee.dto.request.BulkTimeSlotRequest; // ✅ Added import for bulk request
import com.rupee.dto.request.TimeSlotRequest;
import com.rupee.dto.response.TimeSlotResponse;
import com.rupee.service.TimeSlotService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/timeslots")
@RequiredArgsConstructor
public class TimeSlotController {

    private final TimeSlotService timeSlotService;

    @PostMapping
    public ResponseEntity<TimeSlotResponse> createSlot(@Valid @RequestBody TimeSlotRequest request) {
        return new ResponseEntity<>(timeSlotService.createSlot(request), HttpStatus.CREATED);
    }

    // ✅ NEW BULK ENDPOINT
    @PostMapping("/bulk")
    public ResponseEntity<List<TimeSlotResponse>> createSlotsInBulk(@Valid @RequestBody BulkTimeSlotRequest request) {
        return new ResponseEntity<>(timeSlotService.createSlotsInBulk(request.getTimeSlots()), HttpStatus.CREATED);
    }

    @GetMapping("/{id}")
    public ResponseEntity<TimeSlotResponse> getSlotById(@PathVariable Long id) {
        return ResponseEntity.ok(timeSlotService.getSlotById(id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<TimeSlotResponse> updateSlot(@PathVariable Long id, @Valid @RequestBody TimeSlotRequest request) {
        return ResponseEntity.ok(timeSlotService.updateSlot(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSlot(@PathVariable Long id) {
        timeSlotService.deleteSlot(id);
        return ResponseEntity.noContent().build();
    }

    // --- GENERAL FETCH FOR UI ---

    @GetMapping("/consultant/{consultantId}")
    public ResponseEntity<List<TimeSlotResponse>> getAllSlotsForConsultant(@PathVariable Long consultantId) {
        return ResponseEntity.ok(timeSlotService.getAllSlotsForConsultant(consultantId));
    }

    @GetMapping("/consultant/{consultantId}/available")
    public ResponseEntity<List<TimeSlotResponse>> getAvailableSlotsForConsultant(@PathVariable Long consultantId) {
        return ResponseEntity.ok(timeSlotService.getAvailableSlotsForConsultant(consultantId));
    }

    // --- WINDOW FETCH FOR UI ---

    @GetMapping("/consultant/{consultantId}/window")
    public ResponseEntity<List<TimeSlotResponse>> getAvailableSlotsForWindow(@PathVariable Long consultantId) {
        return ResponseEntity.ok(timeSlotService.getAvailableSlotsForWindow(consultantId));
    }
}