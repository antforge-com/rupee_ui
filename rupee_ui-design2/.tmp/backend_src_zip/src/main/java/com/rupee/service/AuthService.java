package com.rupee.service;

import com.rupee.entity.OtpVerification;
import com.rupee.repository.OtpVerificationRepository;
import com.rupee.repository.UserRepository;
import com.rupee.util.EmailValidator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final OtpVerificationRepository otpRepository;
    private final UserRepository userRepository;
    private final EmailService emailService;
    private final SmsService smsService;

    @Value("${app.sms.enabled:false}")
    private boolean isSmsEnabled;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    // ==========================================
    // 1. REGISTRATION OTP LOGIC
    // ==========================================

    @Transactional
    public void sendRegistrationOtp(String email) {
        // Safe internal call to a private method (Proxy already triggered)
        executeSendRegistrationOtp(email, null);
    }

    @Transactional
    public void sendRegistrationOtp(String email, String phoneNumber) {
        // Safe internal call to a private method (Proxy already triggered)
        executeSendRegistrationOtp(email, phoneNumber);
    }

    // The actual business logic is now in a private helper method
    private void executeSendRegistrationOtp(String email, String phoneNumber) {
        EmailValidator.validateEmail(email);

        if (userRepository.existsByIdentifier(email)) {
            throw new IllegalArgumentException("This email is already registered. Please log in.");
        }

        String otp = String.format("%06d", SECURE_RANDOM.nextInt(1000000));

        OtpVerification otpVerification = new OtpVerification();
        otpVerification.setEmail(email);
        otpVerification.setPhoneNumber(phoneNumber);
        otpVerification.setOtp(otp);
        otpVerification.setCreatedAt(LocalDateTime.now());
        otpVerification.setExpiryTime(LocalDateTime.now().plusMinutes(10));
        otpVerification.setUsed(false);
        otpVerification.setAttempts(0);

        otpRepository.save(otpVerification);

        try {
            emailService.sendRegistrationOtp(email, otp, "User");

            if (isSmsEnabled && phoneNumber != null && !phoneNumber.isBlank()) {
                smsService.sendRegistrationSms(phoneNumber, otp);
            } else {
                log.info("SMS disabled or missing phone. Verification for {} will proceed via Email OTP only.", email);
            }
        } catch (Exception e) {
            log.error("Failed to send OTP email to {}", email, e);
            throw new EmailServiceException("Failed to send verification email. Please try again.");
        }
    }

    public static class EmailServiceException extends RuntimeException {
        public EmailServiceException(String message) {
            super(message);
        }
    }

    // ==========================================
    // 2. FORGOT PASSWORD (UNTOUCHED)
    // ==========================================

    @Transactional
    public void sendPasswordResetOtp(String email) {
        EmailValidator.validateEmail(email);

        if (!userRepository.existsByIdentifier(email)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No account found with this email address.");
        }

        String otp = String.format("%06d", SECURE_RANDOM.nextInt(1000000));

        OtpVerification otpVerification = new OtpVerification();
        otpVerification.setEmail(email);
        otpVerification.setOtp(otp);
        otpVerification.setCreatedAt(LocalDateTime.now());
        otpVerification.setExpiryTime(LocalDateTime.now().plusMinutes(10));
        otpVerification.setUsed(false);
        otpVerification.setAttempts(0);
        otpRepository.save(otpVerification);

        try {
            emailService.sendPasswordResetOtp(email, otp);
        } catch (Exception e) {
            log.error("Failed to send reset email to {}", email, e);
            throw new EmailServiceException("Failed to send reset email. Please try again.");
        }
    }

    // ==========================================
    // 3. OTP VERIFICATION LOGIC
    // ==========================================

    /**
     * Checks if an OTP is valid without consuming it (does not mark it as used).
     * Increments the attempt counter on failure to prevent brute-force attacks.
     */
    @Transactional
    public void checkOtpValid(String email, String otp) {
        OtpVerification otpRecord = otpRepository.findTopByEmailOrderByCreatedAtDesc(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No OTP found for this email."));

        if (otpRecord.isUsed()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP has already been used.");
        }

        if (otpRecord.getExpiryTime().isBefore(LocalDateTime.now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP has expired. Please request a new one.");
        }

        if (otpRecord.getAttempts() >= 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Maximum OTP attempts reached. Please request a new one.");
        }

        if (!otpRecord.getOtp().equals(otp)) {
            otpRecord.setAttempts(otpRecord.getAttempts() + 1);
            otpRepository.save(otpRecord);
            int attemptsLeft = 3 - otpRecord.getAttempts();
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid OTP. " + attemptsLeft + " attempts remaining.");
        }

        // 🛑 DO NOT set to used. Just return successfully so the frontend knows it's valid.
    }

    @Transactional
    public void verifyAndMarkOtpUsed(String email, String otp) {
        // Safe internal call to a private method (Proxy already triggered)
        executeVerifyAndMarkOtpUsed(email, null, otp);
    }

    @Transactional
    public void verifyAndMarkOtpUsed(String email, String phoneNumber, String otp) {
        // Safe internal call to a private method (Proxy already triggered)
        executeVerifyAndMarkOtpUsed(email, phoneNumber, otp);
    }

    // The actual business logic is now in a private helper method
    private void executeVerifyAndMarkOtpUsed(String email, String phoneNumber, String otp) {
        OtpVerification otpRecord = otpRepository.findTopByEmailOrderByCreatedAtDesc(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No OTP request found for this email."));

        if (!otpRecord.isValid()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP is expired or already used.");
        }

        if (!otpRecord.getOtp().equals(otp)) {
            otpRecord.setAttempts(otpRecord.getAttempts() + 1);
            otpRepository.save(otpRecord);
            int attemptsLeft = 3 - otpRecord.getAttempts();
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid OTP. " + attemptsLeft + " attempts remaining.");
        }

        // ✅ BULLETPROOF SECURITY CHECK
        if (otpRecord.getPhoneNumber() != null && !otpRecord.getPhoneNumber().equals(phoneNumber)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Phone number mismatch or missing. Please request a new OTP.");
        }

        otpRecord.setUsed(true);
        otpRepository.save(otpRecord);
    }
}