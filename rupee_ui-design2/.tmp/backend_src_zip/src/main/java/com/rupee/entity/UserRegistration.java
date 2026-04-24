package com.rupee.entity;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDate;

@Entity
@Table(name = "user_registrations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class UserRegistration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId; // Loose coupling to User table

    @Column(nullable = false, length = 100)
    private String name;

    private String location;

    @Column(nullable = false, length = 100, unique = true)
    private String email;

    // FIXED: Now mandatory!
    @Column(name = "phone_number", length = 10, unique = true, nullable = false)
    private String phoneNumber;

    // ADDED: Profile Image URL
    @Column(name = "profile_image_url", columnDefinition = "TEXT")
    private String profileImageUrl;

    // ADD THESE:
    @Column(name = "designation")
    private String designation;

    @Column(name = "organization_name")
    private String organizationName;

    @Column(name = "subscription_plan_id")
    private Long subscriptionPlanId;

    // ADD THIS TO THE BOTTOM OF YOUR FIELDS
    @CreationTimestamp
    @Column(name = "member_since", updatable = false)
    private LocalDate memberSince;
}