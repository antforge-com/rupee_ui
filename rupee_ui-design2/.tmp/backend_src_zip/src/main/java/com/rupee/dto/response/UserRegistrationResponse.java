package com.rupee.dto.response;

import lombok.Data;

import java.time.LocalDate;

@Data
public class UserRegistrationResponse {

    private Long userId; // The core User ID from the User table
    private String name;
    private String location;
    private String email;

    // ✅ ADDED: Phone number field to return to the frontend
    private String phoneNumber;

    // ✅ ADDED: Profile Image URL to display the user's avatar
    private String profileImageUrl;

    // ADD THESE:
    private String designation;
    private String organizationName;

    // ✅ Full plan details returned (will be null if they are on the Free plan)
    private SubscriptionPlanResponse subscriptionPlan;

    // ADD THIS: The date the user joined (e.g., "2026-03-21")
    private LocalDate memberSince;
}