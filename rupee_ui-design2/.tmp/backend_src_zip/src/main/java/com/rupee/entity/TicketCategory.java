package com.rupee.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "ticket_categories")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TicketCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String name; // e.g., "Billing", "Technical Support"

    @Column
    private String description;

    @Column(name = "is_active", nullable = false)
    private boolean isActive = true; // Allows admins to "hide" old categories without deleting them
}