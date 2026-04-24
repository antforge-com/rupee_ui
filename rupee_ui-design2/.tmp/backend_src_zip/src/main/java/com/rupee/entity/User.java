package com.rupee.entity;

import com.rupee.enums.UserEnums.Role;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import jakarta.persistence.*;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Slf4j
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Renamed to 'identifier' to support both Email or Mobile as per Figma UI
    @Column(name = "identifier", nullable = false, unique = true)
    private String identifier;

    @Column(nullable = false)
    private String password;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    // Tracks if the user needs to change their auto-generated password
    @Column(name = "requires_password_change", nullable = false)
    private boolean requiresPasswordChange = true;

    // Added for Option B linkage
    // Unique ensures 1 User = 1 Consultant. Nullable allows regular users to exist.
    @Column(name = "consultant_id", unique = true)
    private Long consultantId;
}