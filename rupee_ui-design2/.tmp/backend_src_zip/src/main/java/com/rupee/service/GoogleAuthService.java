package com.rupee.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.rupee.dto.request.GoogleTokenRequest;
import com.rupee.dto.response.AuthResponse;
import com.rupee.entity.User;
import com.rupee.enums.UserEnums.Role;
import com.rupee.repository.UserRepository;
import com.rupee.util.JwtUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.Collections;
import java.util.UUID;

@Service
public class GoogleAuthService {

    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;
    private final PasswordEncoder passwordEncoder;

    // You will get this from the Google Cloud Console
    @Value("${spring.security.oauth2.client.registration.google.client-id}")
    private String googleClientId;

    public GoogleAuthService(UserRepository userRepository, JwtUtil jwtUtil, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.jwtUtil = jwtUtil;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    // Removed the generic "throws Exception" clause entirely for cleaner architecture.
    public AuthResponse authenticateWithGoogle(GoogleTokenRequest request) {

        GoogleIdToken idToken;

        try {
            // 1. Verify the token with Google
            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), new GsonFactory())
                    .setAudience(Collections.singletonList(googleClientId))
                    .build();

            idToken = verifier.verify(request.getIdToken());

        } catch (GeneralSecurityException | IllegalArgumentException e) {
            // Replaced generic Exception with specific Spring library exception for signature/security failures
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid Google ID Token signature.");
        } catch (IOException e) {
            // Replaced generic Exception to gracefully handle Google API network connection failures
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Could not contact Google verification servers.");
        }

        if (idToken == null) {
            // Replaced generic RuntimeException with specific Spring library exception
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired Google ID Token.");
        }

        // 2. Extract user info from Google's payload
        GoogleIdToken.Payload payload = idToken.getPayload();
        String email = payload.getEmail();

        // 3. Check if user already exists in your DB
        User user = userRepository.findByIdentifier(email).orElse(null);

        // 4. Auto-Register if they are a brand new user
        if (user == null) {
            user = new User();
            user.setIdentifier(email); // Use the Google email as the identifier
            // Generate a random impossible password since they login via Google
            user.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
            user.setRole(Role.GUEST); // Default role

            // Google users should NEVER be forced to change a password!
            user.setRequiresPasswordChange(false);

            user = userRepository.save(user);
        }

        // Now passing both identifier and role, matching your AuthController
        String finAdviseJwt = jwtUtil.generateToken(user.getIdentifier(), user.getRole().name());

        // Now passing all 6 required parameters to AuthResponse
        return new AuthResponse(
                finAdviseJwt,
                user.getId(),
                user.getIdentifier(),
                user.getRole().name(),
                user.getConsultantId(),
                user.isRequiresPasswordChange() // ADD THIS 6TH ARGUMENT!
        );
    }
}