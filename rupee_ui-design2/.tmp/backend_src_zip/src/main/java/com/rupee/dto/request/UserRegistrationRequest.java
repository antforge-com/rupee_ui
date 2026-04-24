package com.rupee.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

@Data
public class UserRegistrationRequest {

    @NotBlank(message = "Name is required")
    @Size(min = 2, max = 100, message = "Name must be between 2 and 100 characters")
    private String name;

    @Size(max = 255, message = "Location cannot exceed 255 characters")
    private String location;

    // FIXED: Direct mapping for email
    @NotBlank(message = "Email is required")
    @Email(message = "Must be a valid email format")
    private String email;

    // UPDATED: Now Mandatory and strictly 10 digits
    @NotBlank(message = "Phone number is required")
    @Pattern(regexp = "^\\d{10}$", message = "Phone number must be exactly 10 digits")
    private String phoneNumber;

    // ADDED: The 6-digit OTP required for registration verification
    @NotBlank(message = "OTP is required")
    @Pattern(regexp = "^\\d{6}$", message = "OTP must be exactly 6 digits")
    private String otp;

    // ADDED: Optional profile image URL or Base64 string
    private String profileImageUrl;

    // Password and Subscribed handled internally by Service
    private Boolean subscribed;
    private Long subscriptionPlanId;
}