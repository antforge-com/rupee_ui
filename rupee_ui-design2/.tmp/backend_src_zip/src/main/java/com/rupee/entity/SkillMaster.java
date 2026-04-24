package com.rupee.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "skill_master")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SkillMaster {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // unique = true ensures we don't get duplicates like two "Tax Planning" entries
    @Column(name = "skill_name", nullable = false, unique = true, length = 50)
    private String skillName;

    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;
}