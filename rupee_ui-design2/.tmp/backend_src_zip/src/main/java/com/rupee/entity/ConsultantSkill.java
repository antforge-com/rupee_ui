package com.rupee.entity;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import jakarta.persistence.*;

@Entity
@Table(name = "consultant_skills") // ✅ Updated table name
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ConsultantSkill {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ✅ Updated column and variable name
    @Column(name = "consultant_id", nullable = false)
    private Long consultantId; // Loose coupling reference to Consultant table

    @Column(name = "skill_name", nullable = false, length = 50)
    private String skillName; // e.g., "Tax Planning", "Retirement"
}