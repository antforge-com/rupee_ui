package com.rupee.repository;

import com.rupee.entity.ConsultantSkill;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface ConsultantSkillRepository extends JpaRepository<ConsultantSkill, Long> {

    List<ConsultantSkill> findByConsultantId(Long consultantId);

    boolean existsByConsultantIdAndSkillNameIgnoreCase(Long consultantId, String skillName);

    @Transactional
    @Modifying
    @Query("DELETE FROM ConsultantSkill c WHERE c.consultantId = :consultantId")
    void deleteAllByConsultantId(@Param("consultantId") Long consultantId);
}