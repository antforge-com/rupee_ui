package com.rupee.controller;

import com.rupee.dto.request.AutoResponderDto;
import com.rupee.dto.request.BusinessHoursRequest;
import com.rupee.dto.request.FeeConfigRequest;
import com.rupee.dto.request.HolidayRequest;
import com.rupee.dto.response.BusinessHoursResponse;
import com.rupee.dto.response.HolidayResponse;
import com.rupee.service.SystemSettingsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@CrossOrigin(origins = "*") // ✅ ADDED THIS TO PREVENT CORS BLOCKING
@RestController
@RequestMapping("/api/admin/settings")
@RequiredArgsConstructor
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
public class SystemSettingsController {

    private final SystemSettingsService systemSettingsService;

    @GetMapping("/additional-charges")
    public ResponseEntity<FeeConfigRequest> getAdditionalCharges() {
        return ResponseEntity.ok(systemSettingsService.getFeeSettings());
    }

    // ==========================================
    // ✅ NEW PUBLIC ENDPOINT FOR THE FRONTEND
    // ==========================================
    @GetMapping("/public/fee-config")
    @PreAuthorize("isAuthenticated()") // ✅ Only users with a valid JWT token can enter
    public ResponseEntity<FeeConfigRequest> getPublicFeeConfig() {
        // We safely reuse the exact same service method!
        return ResponseEntity.ok(systemSettingsService.getFeeSettings());
    }

    @PostMapping("/additional-charges")
    public ResponseEntity<FeeConfigRequest> updateAdditionalCharges(@Valid @RequestBody FeeConfigRequest request) {
        return ResponseEntity.ok(systemSettingsService.updateFeeSettings(request));
    }

    // --- BUSINESS HOURS ---

    @GetMapping("/business-hours")
    public ResponseEntity<List<BusinessHoursResponse>> getBusinessHours() {
        return ResponseEntity.ok(systemSettingsService.getAllBusinessHours());
    }

    @PostMapping("/business-hours")
    public ResponseEntity<List<BusinessHoursResponse>> updateBusinessHours(@RequestBody List<BusinessHoursRequest> requests) {
        return ResponseEntity.ok(systemSettingsService.updateBusinessHours(requests));
    }

    // --- HOLIDAYS ---

    @GetMapping("/holidays")
    public ResponseEntity<List<HolidayResponse>> getHolidays() {
        return ResponseEntity.ok(systemSettingsService.getAllHolidays());
    }

    @PostMapping("/holidays")
    public ResponseEntity<HolidayResponse> addHoliday(@RequestBody HolidayRequest request) {
        return ResponseEntity.ok(systemSettingsService.addHoliday(request));
    }

    @DeleteMapping("/holidays/{id}")
    public ResponseEntity<Void> deleteHoliday(@PathVariable Long id) {
        systemSettingsService.deleteHoliday(id);
        return ResponseEntity.noContent().build();
    }

    // --- AUTO RESPONDER ---

    @GetMapping("/auto-responder")
    public ResponseEntity<AutoResponderDto> getAutoResponderSettings() {
        return ResponseEntity.ok(systemSettingsService.getAutoResponderSettings());
    }

    @PostMapping("/auto-responder")
    public ResponseEntity<AutoResponderDto> updateAutoResponderSettings(@RequestBody AutoResponderDto request) {
        return ResponseEntity.ok(systemSettingsService.updateAutoResponderSettings(request));
    }
}