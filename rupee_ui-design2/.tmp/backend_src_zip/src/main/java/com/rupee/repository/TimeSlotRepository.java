package com.rupee.repository;

import com.rupee.entity.TimeSlot;
import com.rupee.enums.TimeSlotEnums.SlotStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

public interface TimeSlotRepository extends JpaRepository<TimeSlot, Long> {

    List<TimeSlot> findByConsultantId(Long consultantId);

    // ✅ Ordering by Master ID keeps chronological order if master table is sequential
    List<TimeSlot> findByConsultantIdOrderBySlotDateAscMasterTimeSlotIdAsc(Long consultantId);

    // ✅ Uses SlotStatus instead of isBooked
    List<TimeSlot> findByConsultantIdAndStatusOrderBySlotDateAscMasterTimeSlotIdAsc(Long consultantId, SlotStatus status);

    // ✅ Uses SlotStatus instead of isBooked
    List<TimeSlot> findByConsultantIdAndStatusAndSlotDateBetweenOrderBySlotDateAscMasterTimeSlotIdAsc(
            Long consultantId, SlotStatus status, LocalDate startDate, LocalDate endDate);

    // ✅ Checks duplicates against the Master ID
    boolean existsByConsultantIdAndSlotDateAndMasterTimeSlotId(Long consultantId, LocalDate slotDate, Long masterTimeSlotId);

    boolean existsByConsultantIdAndSlotDateAndMasterTimeSlotIdAndIdNot(
            Long consultantId, LocalDate slotDate, Long masterTimeSlotId, Long id);

    @Transactional
    @Modifying
    @Query("DELETE FROM TimeSlot t WHERE t.consultantId = :consultantId")
    void deleteAllByConsultantId(@Param("consultantId") Long consultantId);

    boolean existsByMasterTimeSlotId(Long masterTimeSlotId);

    boolean existsByConsultantIdAndSlotDateAndStatus(Long consultantId, LocalDate slotDate, SlotStatus status);

    // --- ANALYTICS QUERIES ---
    long countByConsultantId(Long consultantId);
    long countByConsultantIdAndStatus(Long consultantId, SlotStatus status);
}