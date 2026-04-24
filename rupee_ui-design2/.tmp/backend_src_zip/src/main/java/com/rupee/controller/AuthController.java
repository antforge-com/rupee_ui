package com.rupee.controller;

import com.rupee.entity.User;
import com.rupee.service.AuthService;
import com.rupee.service.UserService;
import com.rupee.util.JwtUtil;
import com.rupee.dto.response.AuthResponse; // ✅ NEW: Import the standalone AuthResponse

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@CrossOrigin(origins = "*") // Note: Your robust SecurityConfig CORS rules take priority over this
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final UserService userService;
    private final JwtUtil jwtUtil;
    private final AuthService authService;

    // ✅ NEW: Injected GoogleAuthService
    //private final GoogleAuthService googleAuthService;

    @PostMapping("/authenticate")
    public ResponseEntity<AuthResponse> authenticate(@RequestBody AuthRequest authRequest) {
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(authRequest.getIdentifier(), authRequest.getPassword())
            );
        } catch (AuthenticationException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(null);
        }

        final UserDetails userDetails = userService.loadUserByUsername(authRequest.getIdentifier());

        User user = userService.getUserByIdentifier(authRequest.getIdentifier())
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        final String token = jwtUtil.generateToken(
                userDetails.getUsername(),
                user.getRole().name()
        );

        return ResponseEntity.ok(new AuthResponse(
                token,
                user.getId(),
                user.getIdentifier(),
                user.getRole().name(),
                user.getConsultantId(),
                user.isRequiresPasswordChange() // ADD THIS 6TH ARGUMENT!
        ));
    }

    /*
    // ✅ NEW: The Google Login Endpoint for React/Flutter
    @PostMapping("/oauth/google")
    public ResponseEntity<AuthResponse> googleLogin(@RequestBody GoogleTokenRequest request) {
        try {
            AuthResponse response = googleAuthService.authenticateWithGoogle(request);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Google authentication failed", e);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
    } */

    @PostMapping("/send-otp")
    public ResponseEntity<OtpResponse> sendOtp(@Valid @RequestBody RegistrationOtpRequest request) {

        // The logic remains exactly the same!
        authService.sendRegistrationOtp(request.getEmail(), request.getPhoneNumber());

        // ✅ OPTIONAL TWEAK: A more inclusive success message
        String message = request.getPhoneNumber() != null
                ? "OTP sent successfully to your email and phone."
                : "OTP sent successfully to your email.";

        return ResponseEntity.ok(new OtpResponse(message));
    }

    @PostMapping("/check-otp")
    public ResponseEntity<Map<String, String>> checkOtp(@RequestBody Map<String, String> request) {
        String email = request.get("email");
        String otp = request.get("otp");

        if (email == null || email.isBlank() || otp == null || otp.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email and OTP are required.");
        }

        // Validates the OTP but leaves it ready to be consumed by the final submission
        authService.checkOtpValid(email, otp);

        return ResponseEntity.ok(Map.of(
                "status", "SUCCESS",
                "message", "OTP is valid."
        ));
    }

    // --- DTOs (Inner Classes) ---

    // 🚨 REMOVED: public static class AuthResponse (It is now a standalone file!)

    @Data
    public static class AuthRequest {
        private String identifier;
        private String password;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OtpRequest {
        @NotBlank(message = "Email is required")
        @Email(message = "Must be a valid email format")
        private String email;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class OtpResponse {
        private String message;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RegistrationOtpRequest {
        @NotBlank(message = "Email is required")
        @Email(message = "Must be a valid email format")
        private String email;

        // ✅ FIX: Removed @NotBlank!
        // Now, if the frontend sends it, great! We bind it.
        // If the frontend doesn't send it, it defaults to null, we skip SMS, and onboarding still works!
        private String phoneNumber;
    }
}