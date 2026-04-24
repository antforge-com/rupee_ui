package com.rupee.controller;

import com.rupee.dto.request.MasterTimeSlotRequest;
import com.rupee.dto.response.MasterTimeSlotResponse;
import com.rupee.service.MasterTimeSlotService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/master-timeslots")
@RequiredArgsConstructor
public class MasterTimeSlotController {

    private final MasterTimeSlotService masterTimeSlotService;

    // 🟢 The Frontend calls this to populate the dropdowns!
    // 🟢 ✅ UPDATED: Now supports Pagination and Sorting!
    @GetMapping
    public ResponseEntity<Page<MasterTimeSlotResponse>> getAllMasterSlots(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            @RequestParam(defaultValue = "id") String sortBy) {

        // Create a Pageable object to pass to the service
        Pageable pageable = PageRequest.of(page, size, Sort.by(sortBy));

        return ResponseEntity.ok(masterTimeSlotService.getAllMasterSlots(pageable));
    }

    // 🔴 These endpoints allow an Admin to add/edit/delete the master list over time
    @PostMapping
    public ResponseEntity<MasterTimeSlotResponse> createMasterSlot(@Valid @RequestBody MasterTimeSlotRequest request) {
        return new ResponseEntity<>(masterTimeSlotService.createMasterSlot(request), HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public ResponseEntity<MasterTimeSlotResponse> updateMasterSlot(@PathVariable Long id, @Valid @RequestBody MasterTimeSlotRequest request) {
        return ResponseEntity.ok(masterTimeSlotService.updateMasterSlot(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteMasterSlot(@PathVariable Long id) {
        masterTimeSlotService.deleteMasterSlot(id);
        return ResponseEntity.noContent().build();
    }
}