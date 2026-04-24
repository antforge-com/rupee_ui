package com.rupee.controller;

import com.rupee.dto.request.UpdatePasswordRequest;
import com.rupee.dto.request.UpdateUserRequest; // ✅ Imported the new DTO
import com.rupee.dto.response.UserResponse;
import com.rupee.entity.User;
import com.rupee.enums.UserEnums.Role;
import com.rupee.service.AuthService;
import com.rupee.service.SecurityService;
import com.rupee.service.UserService;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.List;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@Slf4j
public class UserController {

    private final UserService userService;
    private final SecurityService securityService;

    private final AuthService authService;


    // == 1. SPECIFIC/PUBLIC ROUTES FIRST ==

    @GetMapping("/me")
    public ResponseEntity<UserResponse> getCurrentUserProfile() {
        User currentUser = securityService.getCurrentUser();

        // Grabbing the Consultant ID for the frontend context
        UserResponse response = new UserResponse(
                currentUser.getId(),
                currentUser.getIdentifier(),
                currentUser.getRole(),
                currentUser.getConsultantId(),
                currentUser.isRequiresPasswordChange() // <-- ADD THIS LINE
        );
        return ResponseEntity.ok(response);
    }

    // 1. Request the OTP (Public)
    @PostMapping("/forgot-password")
    public ResponseEntity<AuthController.OtpResponse> forgotPassword(@Valid @RequestBody AuthController.OtpRequest request) {
        // Calling authService to handle the email sending logic
        authService.sendPasswordResetOtp(request.getEmail());
        return ResponseEntity.ok(new AuthController.OtpResponse("Reset OTP sent to " + request.getEmail()));
    }


    // 2. Submit the new password with the OTP (Public)
    @PostMapping("/reset-password")
    public ResponseEntity<AuthController.OtpResponse> resetPassword(@Valid @RequestBody PasswordResetSubmitRequest request) {
        // This method ensures the password is only changed for the owner of that email
        userService.resetPasswordWithOtp(request.getEmail(), request.getOtp(), request.getNewPassword());
        return ResponseEntity.ok(new AuthController.OtpResponse("Password has been reset successfully."));
    }

    // 3. Change password while logged in (Requires Auth Token)
    @PutMapping("/change-password")
    public ResponseEntity<AuthController.OtpResponse> changePassword(@Valid @RequestBody UpdatePasswordRequest request) {
        userService.changePassword(request.getNewPassword(), request.getConfirmPassword());
        return ResponseEntity.ok(new AuthController.OtpResponse("Password has been changed successfully."));
    }

    @GetMapping("/role/{role}")
    public ResponseEntity<List<UserResponse>> getUsersByRole(@PathVariable Role role) {
        List<UserResponse> users = userService.getUsersByRole(role);
        return ResponseEntity.ok(users);
    }

    @GetMapping
    public ResponseEntity<List<UserResponse>> getAllUsers() {
        return ResponseEntity.ok(userService.getAllUsers());
    }

    // == 2. PARAMETERIZED ROUTES LAST (With Regex) ==
    // The [0-9]+ regex prevents conflicts with AuthController's /register and /authenticate

    @GetMapping("/{id:[0-9]+}")
    public ResponseEntity<UserResponse> getUserById(@PathVariable Long id) {
        return ResponseEntity.ok(userService.getUserById(id));
    }

    // ✅ Swapped @RequestBody to UpdateUserRequest
    @PutMapping("/{id:[0-9]+}")
    public ResponseEntity<UserResponse> updateUser(
            @PathVariable Long id,
            @Valid @RequestBody UpdateUserRequest userRequest) {
        return ResponseEntity.ok(userService.updateUser(id, userRequest));
    }

    @DeleteMapping("/{id:[0-9]+}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.deleteUser(id);
        return ResponseEntity.noContent().build();
    }

    // --- DTO for Password Reset ---
    @Data
    public static class PasswordResetSubmitRequest {
        @NotBlank(message = "Email is required")
        private String email;

        @NotBlank(message = "OTP is required")
        private String otp;

        @NotBlank(message = "New password is required")
        private String newPassword;
    }
}