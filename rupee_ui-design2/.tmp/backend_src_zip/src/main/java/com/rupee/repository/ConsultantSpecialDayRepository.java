package com.rupee.repository;

import com.rupee.entity.ConsultantSpecialDay;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.List;

public interface ConsultantSpecialDayRepository extends JpaRepository<ConsultantSpecialDay, Long> {
    boolean existsByConsultantIdAndSpecialDate(Long consultantId, LocalDate specialDate);
    List<ConsultantSpecialDay> findByConsultantId(Long consultantId);
    void deleteByConsultantIdAndSpecialDate(Long consultantId, LocalDate specialDate);
}