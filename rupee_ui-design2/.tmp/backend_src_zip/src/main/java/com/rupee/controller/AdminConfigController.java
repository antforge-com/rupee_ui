package com.rupee.controller;

import com.rupee.dto.request.CannedResponseRequest;
import com.rupee.dto.request.TicketCategoryRequest;
import com.rupee.dto.response.CannedResponseResponse;
import com.rupee.dto.response.TicketCategoryResponse;
import com.rupee.service.AdminConfigService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@CrossOrigin(origins = "*") // ✅ Prevents CORS issues on the frontend
@RestController
@RequestMapping("/api/admin/config")
@RequiredArgsConstructor
public class AdminConfigController {

    private final AdminConfigService adminConfigService;

    // ==========================================
    // 1. CANNED RESPONSES ENDPOINTS
    // ==========================================

    @GetMapping("/canned-responses")
    @PreAuthorize("hasAnyRole('ADMIN', 'CONSULTANT')")
    public ResponseEntity<List<CannedResponseResponse>> getCannedResponses(@RequestParam(required = false) String category) {
        // ✅ Clean Architecture: Logic delegated entirely to the Service layer
        return ResponseEntity.ok(adminConfigService.getCannedResponses(category));
    }

    @PostMapping("/canned-responses")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<CannedResponseResponse> createCannedResponse(@Valid @RequestBody CannedResponseRequest request) {
        return new ResponseEntity<>(adminConfigService.createCannedResponse(request), HttpStatus.CREATED);
    }

    @DeleteMapping("/canned-responses/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteCannedResponse(@PathVariable Long id) {
        adminConfigService.deleteCannedResponse(id);
        return ResponseEntity.noContent().build();
    }

    // ==========================================
    // 2. TICKET CATEGORIES ENDPOINTS
    // ==========================================

    // ✅ Public to authenticated users so they can populate the "Create Ticket" form dropdown
    @GetMapping("/categories")
    public ResponseEntity<List<TicketCategoryResponse>> getActiveCategories() {
        return ResponseEntity.ok(adminConfigService.getActiveCategories());
    }

    @PostMapping("/categories")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<TicketCategoryResponse> createCategory(@Valid @RequestBody TicketCategoryRequest request) {
        return new ResponseEntity<>(adminConfigService.createCategory(request), HttpStatus.CREATED);
    }

    @PatchMapping("/categories/{id}/toggle")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<TicketCategoryResponse> toggleCategory(@PathVariable Long id) {
        return ResponseEntity.ok(adminConfigService.toggleCategory(id));
    }
}