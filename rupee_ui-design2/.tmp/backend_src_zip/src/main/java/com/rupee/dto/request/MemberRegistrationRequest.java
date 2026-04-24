package com.rupee.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

@Data
public class MemberRegistrationRequest {

    @NotBlank(message = "Name is required")
    @Size(min = 2, max = 100, message = "Name must be between 2 and 100 characters")
    private String name;

    @Size(max = 255, message = "Location cannot exceed 255 characters")
    private String location;

    @NotBlank(message = "Email is required")
    @Email(message = "Must be a valid email format")
    private String email;

    @NotBlank(message = "Phone number is required")
    @Pattern(regexp = "^\\d{10}$", message = "Phone number must be exactly 10 digits")
    private String phoneNumber;

    // Optional profile image URL (if not uploading a file directly)
    private String profileImageUrl;
}