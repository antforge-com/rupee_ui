package com.rupee.controller;

import com.rupee.dto.request.MemberRegistrationRequest;
import com.rupee.dto.request.UpdateUserRegistrationRequest;
import com.rupee.dto.request.UserRegistrationRequest;
import com.rupee.dto.response.UserRegistrationResponse;
import com.rupee.service.UserRegistrationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType; // ✅ Added import for MediaType
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile; // ✅ Added import for MultipartFile

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/onboarding")
@RequiredArgsConstructor
public class UserRegistrationController {

    private final UserRegistrationService userRegistrationService;

    // == CREATE ==
    // Publicly accessible
    @PostMapping
    public ResponseEntity<UserRegistrationResponse> initiateOnboarding(@Valid @RequestBody UserRegistrationRequest request) {
        // Delegates the entire creation logic to the OnboardingService
        UserRegistrationResponse created = userRegistrationService.processFullOnboarding(request);

        // Returning 201 CREATED is a RESTful best practice for successful POST requests
        return new ResponseEntity<>(created, HttpStatus.CREATED);
    }

    // == ADMIN CREATE MEMBER ==
    // Only Admins can add members directly
    @PostMapping(value = "/admin/member", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UserRegistrationResponse> createMemberByAdmin(
            @Valid @RequestPart("data") MemberRegistrationRequest request,
            @RequestPart(value = "file", required = false) MultipartFile file) {

        UserRegistrationResponse created = userRegistrationService.registerMemberByAdmin(request, file);
        return new ResponseEntity<>(created, HttpStatus.CREATED);
    }

    // == READ ==
    // Publicly accessible by ID
    @GetMapping("/{id}")
    public ResponseEntity<UserRegistrationResponse> getOnboardingData(@PathVariable Long id) {
        return ResponseEntity.ok(userRegistrationService.getOnboardingData(id));
    }

    // == UPDATE ==
    // Publicly accessible by ID
    // ✅ UPDATED: Added 'consumes' to accept both file and JSON data
    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<UserRegistrationResponse> updateOnboardingData(
            @PathVariable Long id,
            // ✅ Swapped @RequestBody to @RequestPart so it can be sent alongside a file
            @Valid @RequestPart("data") UpdateUserRegistrationRequest request,
            // ✅ ADDED: The optional MultipartFile for the profile image
            @RequestPart(value = "file", required = false) MultipartFile file) {

        // ✅ Passes all arguments to the newly updated Service method
        return ResponseEntity.ok(userRegistrationService.updateOnboardingData(id, request, file));
    }

    // == DELETE ==
    // Publicly accessible by ID
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteOnboardingData(@PathVariable Long id) {
        userRegistrationService.deleteOnboardingData(id);
        return ResponseEntity.noContent().build();
    }
}