package com.rupee.repository;

import com.rupee.entity.SkillMaster;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface SkillMasterRepository extends JpaRepository<SkillMaster, Long> {

    // Used to check if a newly typed skill already exists (returns it even if soft-deleted so we can restore it)
    Optional<SkillMaster> findBySkillNameIgnoreCase(String skillName);

    // Fetch only active skills for the admin dashboard list
    List<SkillMaster> findByIsActiveTrue();

    // Used by the frontend to populate the dropdown (Filters out soft-deleted skills)
    @Query("SELECT s.skillName FROM SkillMaster s WHERE s.isActive = true ORDER BY s.skillName ASC")
    List<String> findAllSkillNames();

    // Helps us cleanly block duplicate skills like trying to create "Tax Planning" twice
    boolean existsBySkillNameIgnoreCase(String skillName);
}