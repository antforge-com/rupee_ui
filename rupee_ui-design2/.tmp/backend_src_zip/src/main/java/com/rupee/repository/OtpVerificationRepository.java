package com.rupee.repository;

import com.rupee.entity.OtpVerification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface OtpVerificationRepository extends JpaRepository<OtpVerification, Long> {

    // ✅ UPDATED: Always fetches the most recently generated OTP for the user.
    // This perfectly handles scenarios where a user clicks "Resend OTP" multiple times.
    Optional<OtpVerification> findTopByEmailOrderByCreatedAtDesc(String email);

    // Clean up old OTPs (Useful if you want to write a scheduled job later to clear out expired rows)
    void deleteByEmail(String email);
}