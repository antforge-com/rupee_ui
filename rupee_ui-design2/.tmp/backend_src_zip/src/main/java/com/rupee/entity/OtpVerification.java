package com.rupee.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_otp_verifications")
@Getter // ✅ Safer for JPA
@Setter // ✅ Safer for JPA
@NoArgsConstructor
@AllArgsConstructor
public class OtpVerification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String email;

    // ✅ NEW: Nullable column to bind a phone number to an email OTP request
    @Column(nullable = true)
    private String phoneNumber;

    // Changed to String to prevent losing leading zeros (e.g., "012345")
    @Column(nullable = false, length = 6)
    private String otp;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime expiryTime;

    @Column(nullable = false)
    private boolean used = false;

    @Column(nullable = false)
    private int attempts = 0;

    // Helper method to check if time has run out
    public boolean isExpired() {
        return LocalDateTime.now().isAfter(expiryTime);
    }

    // Comprehensive security check: Not used, not expired, and under 3 guesses
    public boolean isValid() {
        return !used && !isExpired() && attempts < 3;
    }
}