package com.rupee.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;

@Entity
@Table(name = "subscription_plans")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SubscriptionPlan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50, unique = true)
    private String name; // e.g., "Elite", "Pro"

    @Column(name = "original_price", nullable = false, precision = 10, scale = 2)
    private BigDecimal originalPrice; // The crossed-out price

    @Column(name = "discount_price", nullable = false, precision = 10, scale = 2)
    private BigDecimal discountPrice; // The actual price they pay

    private String features; // e.g., "Tax Optimization + Pro + Live Support"

    @Column(length = 50)
    private String tag; // e.g., "BEST VALUE"
}