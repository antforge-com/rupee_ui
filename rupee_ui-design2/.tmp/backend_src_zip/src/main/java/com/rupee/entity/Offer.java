package com.rupee.entity;

import com.rupee.enums.OfferStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;

@Entity
@Table(name = "offers")
@Getter
@Setter
public class Offer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    // Stores values like "20%" or "500"
    @Column(nullable = false, length = 50)
    private String discount;

    @Column(name = "valid_from", nullable = false)
    private LocalDateTime validFrom;

    @Column(name = "valid_to", nullable = false)
    private LocalDateTime validTo;

    @Column(name = "is_active", nullable = false)
    private boolean isActive;

    // Strict ID reference. Null means it's a global Admin offer.
    @Column(name = "consultant_id")
    private Long consultantId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OfferStatus status = OfferStatus.PENDING;
}