package com.rupee.service;

import com.rupee.dto.request.UpdateUserRequest;
import com.rupee.dto.response.UserResponse;
import com.rupee.entity.User;
import com.rupee.enums.UserEnums.Role;
import com.rupee.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService implements UserDetailsService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    private final AuthService authService;
    private final SecurityService securityService;

    public static final String USER_NOT_FOUND = "User not found";
    public static final String IDENTIFIER_EXISTS = "Email or Mobile already exists";
    private static final String WITH_ID = " with id: ";

    @Transactional
    public UserResponse updateUser(Long id, UpdateUserRequest userRequest) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, USER_NOT_FOUND + WITH_ID + id));

        if (userRequest.getIdentifier() != null && !userRequest.getIdentifier().isEmpty()) {
            if (!user.getIdentifier().equals(userRequest.getIdentifier()) && userRepository.existsByIdentifier(userRequest.getIdentifier())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, IDENTIFIER_EXISTS);
            }
            user.setIdentifier(userRequest.getIdentifier());
        }

        // ✅ REMOVED: Password update logic has been safely removed from the general update flow
        // Passwords should strictly be handled by the updatePassword method below.

        // 🚨 SECURITY BLOCK
        if (userRequest.getRole() != null) {
            if (userRequest.getRole() == Role.ADMIN) {
                log.error("SECURITY ALERT: Attempted to upgrade user ID {} to ADMIN via API.", id);
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Upgrading accounts to ADMIN via API is strictly prohibited.");
            }
            user.setRole(userRequest.getRole());
        }

        if (userRequest.getConsultantId() != null) {
            user.setConsultantId(userRequest.getConsultantId());
        }

        User updatedUser = userRepository.save(user);
        return convertToResponse(updatedUser);
    }

    @Transactional
    public void changePassword(String newPassword, String confirmPassword) {
        if (!newPassword.equals(confirmPassword)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "New password and confirm password do not match.");
        }

        User currentUser = securityService.getCurrentUser();

        User user = userRepository.findById(currentUser.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, USER_NOT_FOUND));

        if (passwordEncoder.matches(newPassword, user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "New password cannot be the same as your current password.");
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        user.setRequiresPasswordChange(false);
        userRepository.save(user);

        // ✅ Explicitly tagged as an Audit event
        log.info("AUDIT: Password successfully changed for user ID: {}", user.getId());
    }

    @Transactional
    public void resetPasswordWithOtp(String email, String otp, String newPassword) {
        authService.verifyAndMarkOtpUsed(email, otp);

        User user = userRepository.findByIdentifier(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, USER_NOT_FOUND));

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        // ✅ Explicitly tagged as an Audit event
        log.info("AUDIT: Password reset via OTP for user ID: {}", user.getId());
    }

    @Transactional
    public void deleteUser(Long id) {
        // ✅ Refactored to only hit the database once
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, USER_NOT_FOUND + WITH_ID + id));

        // 🚨 SECURITY BLOCK
        if (user.getRole() == Role.ADMIN) {
            log.error("SECURITY ALERT: Attempted to delete ADMIN account (ID: {}) via API.", id);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot delete ADMIN accounts via API.");
        }

        userRepository.deleteById(id);

        // ✅ Explicitly tagged as an Audit event for destructive actions
        log.info("AUDIT: User account (ID: {}) successfully deleted via API.", id);
    }

    @Transactional(readOnly = true)
    public UserResponse getUserById(Long id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, USER_NOT_FOUND + WITH_ID + id));

        return convertToResponse(user);
    }

    @Transactional(readOnly = true)
    public Optional<User> getUserByIdentifier(String identifier) {
        return userRepository.findByIdentifier(identifier);
    }

    @Transactional(readOnly = true)
    public List<UserResponse> getAllUsers() {
        return userRepository.findAll().stream()
                .map(this::convertToResponse)
                .toList();
    }

    @Override
    public UserDetails loadUserByUsername(String identifier) throws UsernameNotFoundException {
        User user = userRepository.findByIdentifier(identifier)
                .orElseThrow(() -> new UsernameNotFoundException("User not found with identifier: " + identifier));

        return new org.springframework.security.core.userdetails.User(
                user.getIdentifier(),
                user.getPassword(),
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))
        );
    }

    @Transactional(readOnly = true)
    public List<UserResponse> getUsersByRole(Role role) {
        return userRepository.findByRole(role).stream()
                .map(this::convertToResponse)
                .toList();
    }

    private UserResponse convertToResponse(User user) {
        UserResponse response = new UserResponse();
        response.setId(user.getId());
        response.setIdentifier(user.getIdentifier());
        response.setRole(user.getRole());
        response.setConsultantId(user.getConsultantId());
        response.setRequiresPasswordChange(user.isRequiresPasswordChange());
        return response;
    }
}