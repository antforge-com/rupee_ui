package com.rupee.service;

import com.rupee.dto.request.MemberRegistrationRequest;
import com.rupee.dto.request.UpdateUserRegistrationRequest;
import com.rupee.dto.request.UserRegistrationRequest;
import com.rupee.dto.response.SubscriptionPlanResponse;
import com.rupee.dto.response.UserRegistrationResponse;
import com.rupee.entity.*;
import com.rupee.enums.UserEnums.Role;
import com.rupee.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserRegistrationService {

    private final UserRepository userRepository;
    private final UserRegistrationRepository userRegistrationRepository;
    private final SubscriptionPlanRepository subscriptionPlanRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthService authService;
    private final S3StorageService s3StorageService;
    private final EmailService emailService;
    private final SecurityService securityService;

    // == CREATE (POST) ==
    @Transactional
    public UserRegistrationResponse processFullOnboarding(UserRegistrationRequest request) {

        // 1. Validate Uniqueness
        validateOnboardingUniqueness(request.getEmail(), request.getPhoneNumber());

        // 2. SHARED OTP VERIFICATION
        // ✅ UPDATED: Now passing the phone number to create the cryptographic bind!
        authService.verifyAndMarkOtpUsed(request.getEmail(), request.getPhoneNumber(), request.getOtp());

        // 3. Assign Roles & Subscriptions
        SubscriptionPlan selectedPlan = fetchSubscriptionPlan(request.getSubscriptionPlanId());
        Role assignedRole = determineAssignedRole(selectedPlan);

        // 4. Capture raw password and Create Core User
        String rawPassword = request.getEmail().split("@")[0];
        User savedUser = createCoreUser(request.getEmail(), assignedRole, rawPassword);

        // 5. Create Registration Details
        UserRegistration savedRegistration = createRegistrationDetails(savedUser.getId(), request, selectedPlan);

        // 6. Send the Welcome Email with credentials!
        try {
            emailService.sendWelcomeCredentials(request.getEmail(), request.getName(), rawPassword);
        } catch (Exception e) {
            log.error("Failed to send welcome credentials to {}", request.getEmail(), e);
        }

        return mapToResponse(savedUser.getId(), savedRegistration, selectedPlan);
    }

    // == ADMIN CREATE MEMBER (POST) ==
    @Transactional
    public UserRegistrationResponse registerMemberByAdmin(MemberRegistrationRequest request, MultipartFile file) {

        // 1. Validate Uniqueness (No OTP needed for Admin!)
        validateOnboardingUniqueness(request.getEmail(), request.getPhoneNumber());

        // 2. Capture raw password and Create Core User strictly as a MEMBER
        String rawPassword = request.getEmail().split("@")[0];
        User savedUser = createCoreUser(request.getEmail(), Role.MEMBER, rawPassword);

        // 3. Create Registration Details manually (No Subscription Plan)
        UserRegistration registration = new UserRegistration();
        registration.setUserId(savedUser.getId());
        registration.setName(request.getName());
        registration.setLocation(request.getLocation());
        registration.setEmail(request.getEmail());
        registration.setPhoneNumber(request.getPhoneNumber());

        if (file != null && !file.isEmpty()) {
            registration.setProfileImageUrl(s3StorageService.uploadFile(file, "users"));
        } else {
            registration.setProfileImageUrl(request.getProfileImageUrl());
        }

        UserRegistration savedRegistration = userRegistrationRepository.save(registration);

        // 4. Send the Welcome Email with credentials!
        try {
            emailService.sendWelcomeCredentials(request.getEmail(), request.getName(), rawPassword);
        } catch (Exception e) {
            log.error("Failed to send welcome credentials to {}", request.getEmail(), e);
        }

        return mapToResponse(savedUser.getId(), savedRegistration, null);
    }

    // --- PRIVATE HELPER METHODS ---

    private void validateOnboardingUniqueness(String email, String phoneNumber) {
        if (userRepository.existsByIdentifier(email) || userRegistrationRepository.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already exists");
        }
        if (phoneNumber == null || phoneNumber.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Phone number is mandatory.");
        }
        if (userRegistrationRepository.existsByPhoneNumber(phoneNumber)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This phone number is already registered.");
        }
    }

    private SubscriptionPlan fetchSubscriptionPlan(Long planId) {
        if (planId == null) return null;
        return subscriptionPlanRepository.findById(planId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid subscription plan selected."));
    }

    private Role determineAssignedRole(SubscriptionPlan selectedPlan) {
        // Upgrade role to SUBSCRIBER only for paid plans
        if (selectedPlan != null && selectedPlan.getOriginalPrice().doubleValue() > 0) {
            return Role.SUBSCRIBER;
        }
        return Role.GUEST;
    }

    // ✅ Updated to accept the rawPassword parameter
    private User createCoreUser(String email, Role role, String rawPassword) {
        User user = new User();
        user.setIdentifier(email);
        user.setPassword(passwordEncoder.encode(rawPassword)); // Encrypt before saving
        user.setRole(role);
        user.setRequiresPasswordChange(true); // Force change on first login!
        return userRepository.save(user);
    }

    private UserRegistration createRegistrationDetails(Long userId, UserRegistrationRequest request, SubscriptionPlan plan) {
        UserRegistration registration = new UserRegistration();
        registration.setUserId(userId);
        registration.setName(request.getName());
        registration.setLocation(request.getLocation());
        registration.setEmail(request.getEmail());
        registration.setPhoneNumber(request.getPhoneNumber());
        registration.setProfileImageUrl(null);
        registration.setSubscriptionPlanId(plan != null ? plan.getId() : null);

        return userRegistrationRepository.save(registration);
    }

    // == READ (GET) ==
    @Transactional(readOnly = true)
    public UserRegistrationResponse getOnboardingData(Long userId) {
        UserRegistration registration = userRegistrationRepository.findByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Registration data not found for user: " + userId));

        SubscriptionPlan plan = null;
        if (registration.getSubscriptionPlanId() != null) {
            plan = subscriptionPlanRepository.findById(registration.getSubscriptionPlanId()).orElse(null);
        }

        return mapToResponse(userId, registration, plan);
    }

    // == UPDATE (PUT) ==
    @Transactional
    public UserRegistrationResponse updateOnboardingData(Long userId, UpdateUserRegistrationRequest request, MultipartFile file) {

        // SECURITY CHECK: Users can only update their OWN account. Admins can update anyone.
        User currentUser = securityService.getCurrentUser();
        if (!currentUser.getId().equals(userId) && currentUser.getRole() != Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not authorized to update this account.");
        }

        UserRegistration registration = userRegistrationRepository.findByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Registration data not found for user: " + userId));

        // ✅ THE FIX IS APPLIED HERE: Both Phone AND Email are now safely synchronized.
        updatePhoneNumberIfChanged(registration, request.getPhoneNumber());
        updateEmailIfChanged(userId, registration, request.getEmail());

        updateBasicFields(registration, request);
        updateProfileImage(registration, file);

        SubscriptionPlan selectedPlan = updateSubscriptionPlan(userId, registration, request.getSubscriptionPlanId());

        UserRegistration updatedRegistration = userRegistrationRepository.save(registration);

        return mapToResponse(userId, updatedRegistration, selectedPlan);
    }

    // == PRIVATE HELPER METHODS FOR UPDATE LOGIC ==

    private void updatePhoneNumberIfChanged(UserRegistration registration, String newPhoneNumber) {
        // MANDATORY: If phone number is sent in PUT, it cannot be blank/null
        if (newPhoneNumber == null || newPhoneNumber.isBlank()) {
            return; // Or throw 400 if you want to force it in every update
        }

        if (newPhoneNumber.equals(registration.getPhoneNumber())) {
            return;
        }

        if (userRegistrationRepository.existsByPhoneNumber(newPhoneNumber)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This phone number is already registered.");
        }
        registration.setPhoneNumber(newPhoneNumber);
    }

    // ✅ NEW HELPER: Safely handles email uniqueness and synchronizes the core login User table
    private void updateEmailIfChanged(Long userId, UserRegistration registration, String newEmail) {
        if (newEmail == null || newEmail.isBlank() || newEmail.equals(registration.getEmail())) {
            return;
        }

        // 1. Uniqueness Check across both tables
        if (userRepository.existsByIdentifier(newEmail) || userRegistrationRepository.existsByEmail(newEmail)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This email is already registered to another account.");
        }

        // 2. Update Registration Profile
        registration.setEmail(newEmail);

        // 3. CRITICAL: Update core User table so their login ID matches their new email!
        userRepository.findById(userId).ifPresent(user -> {
            user.setIdentifier(newEmail);
            userRepository.save(user);
        });
    }

    private void updateBasicFields(UserRegistration registration, UpdateUserRegistrationRequest request) {
        if (request.getName() != null) registration.setName(request.getName());
        if (request.getLocation() != null) registration.setLocation(request.getLocation());

        // ADD THESE TWO LINES:
        if (request.getDesignation() != null) registration.setDesignation(request.getDesignation());
        if (request.getOrganizationName() != null) registration.setOrganizationName(request.getOrganizationName());

        // ✅ Email was removed from here because it is now handled securely above
    }

    // ✅ S3 INTEGRATION ADDED HERE: Deletes the old file via S3, and uploads the new one.
    private void updateProfileImage(UserRegistration registration, MultipartFile file) {
        if (file != null && !file.isEmpty()) {
            s3StorageService.deleteFile(registration.getProfileImageUrl());
            registration.setProfileImageUrl(s3StorageService.uploadFile(file, "users"));
        }
    }

    private SubscriptionPlan updateSubscriptionPlan(Long userId, UserRegistration registration, Long planId) {
        if (planId == null) return null;

        SubscriptionPlan selectedPlan = subscriptionPlanRepository.findById(planId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid subscription plan selected."));

        if (!selectedPlan.getId().equals(registration.getSubscriptionPlanId())) {
            registration.setSubscriptionPlanId(selectedPlan.getId());
            Role newRole = selectedPlan.getOriginalPrice().doubleValue() > 0 ? Role.SUBSCRIBER : Role.GUEST;

            userRepository.findById(userId).ifPresent(user -> {
                user.setRole(newRole);
                userRepository.save(user);
            });
        }

        return selectedPlan;
    }

    // == DELETE (DELETE) ==
    @Transactional
    public void deleteOnboardingData(Long userId) {

        // STRICT SECURITY CHECK: ONLY Admins can delete accounts. Regular users cannot delete anything.
        User currentUser = securityService.getCurrentUser();
        if (currentUser.getRole() != Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access Denied: Only Administrators can delete accounts.");
        }

        userRegistrationRepository.findByUserId(userId)
                // S3 INTEGRATION ADDED HERE: Triggers a delete to S3 bucket when user is removed
                .ifPresent(registration -> s3StorageService.deleteFile(registration.getProfileImageUrl()));

        userRegistrationRepository.deleteByUserId(userId);
        userRepository.deleteById(userId);
    }

    // == UTILITY MAPPER ==
    private UserRegistrationResponse mapToResponse(Long userId, UserRegistration registration, SubscriptionPlan plan) {
        UserRegistrationResponse response = new UserRegistrationResponse();
        response.setUserId(userId);
        response.setName(registration.getName());
        response.setLocation(registration.getLocation());
        response.setEmail(registration.getEmail());
        response.setPhoneNumber(registration.getPhoneNumber());

        // ADD THESE TWO LINES:
        response.setDesignation(registration.getDesignation());
        response.setOrganizationName(registration.getOrganizationName());

        response.setProfileImageUrl(registration.getProfileImageUrl());

        // ✅ MAP THE NEW DATE FIELD HERE (With a safe fallback for existing older users)
        response.setMemberSince(registration.getMemberSince() != null ?
                registration.getMemberSince() : LocalDate.now());

        if (plan != null) {
            response.setSubscriptionPlan(SubscriptionPlanResponse.builder()
                    .id(plan.getId())
                    .name(plan.getName())
                    .originalPrice(plan.getOriginalPrice())
                    .discountPrice(plan.getDiscountPrice())
                    .features(plan.getFeatures())
                    .tag(plan.getTag())
                    .build());
        }

        return response;
    }
}