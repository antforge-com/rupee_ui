package com.rupee.controller;

import com.rupee.dto.request.ConsultantRequest;
import com.rupee.dto.request.SpecialDayRequest; // ✅ ADDED
import com.rupee.dto.response.ConsultantResponse;
import com.rupee.entity.MasterTimeSlot;
import com.rupee.service.ConsultantService;
import com.rupee.service.SkillMasterService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/consultants")
@RequiredArgsConstructor
public class ConsultantController {

    private final ConsultantService consultantService;
    private final SkillMasterService skillMasterService;

    // == READ (Publicly viewable by anyone) ==

    @GetMapping("/skills")
    public ResponseEntity<List<String>> getAllMasterSkills() {
        // DELEGATED: The controller asks the Skill service instead of the Consultant service
        // Exposes the master list of all known skills so the frontend can populate the UI dropdown
        return ResponseEntity.ok(skillMasterService.getAllSkillNames());
    }

    @GetMapping
    public ResponseEntity<List<ConsultantResponse>> getAllConsultants() {
        return ResponseEntity.ok(consultantService.getAllConsultants());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ConsultantResponse> getConsultantById(@PathVariable Long id) {
        return ResponseEntity.ok(consultantService.getConsultantById(id));
    }

    // ✅ NEW ENDPOINT: Fetch filtered master time slots for a specific consultant
    @GetMapping("/{id}/master-timeslots")
    public ResponseEntity<List<MasterTimeSlot>> getMasterTimeSlotsByConsultantId(@PathVariable Long id) {
        return ResponseEntity.ok(consultantService.getMasterTimeSlotsByConsultant(id));
    }

    // ==========================================
    // ✅ NEW: SPECIAL DAYS ENDPOINTS
    // ==========================================
    @PostMapping("/{id}/special-days")
    @PreAuthorize("hasAnyRole('ADMIN', 'CONSULTANT')")
    public ResponseEntity<Void> setSpecialDays(@PathVariable Long id, @Valid @RequestBody SpecialDayRequest request) {
        consultantService.setSpecialDays(id, request.getDates());
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{id}/special-days")
    public ResponseEntity<List<LocalDate>> getSpecialDays(@PathVariable Long id) {
        return ResponseEntity.ok(consultantService.getSpecialDays(id));
    }

    @DeleteMapping("/{id}/special-days/{date}")
    @PreAuthorize("hasAnyRole('ADMIN', 'CONSULTANT')")
    public ResponseEntity<Void> removeSpecialDay(@PathVariable Long id, @PathVariable LocalDate date) {
        consultantService.removeSpecialDay(id, date);
        return ResponseEntity.noContent().build();
    }

    // == CREATE/UPDATE/DELETE ==

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ConsultantResponse> createConsultant(
            @RequestPart("data") @Valid ConsultantRequest request,
            @RequestPart(value = "file", required = false) MultipartFile file) {
        return new ResponseEntity<>(consultantService.createConsultant(request, file), HttpStatus.CREATED);
    }

    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ConsultantResponse> updateConsultant(
            @PathVariable Long id,
            @RequestPart("data") @Valid ConsultantRequest request,
            @RequestPart(value = "file", required = false) MultipartFile file) {
        return ResponseEntity.ok(consultantService.updateConsultant(id, request, file));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteConsultant(@PathVariable Long id) {
        consultantService.deleteConsultant(id);
        return ResponseEntity.noContent().build();
    }
}