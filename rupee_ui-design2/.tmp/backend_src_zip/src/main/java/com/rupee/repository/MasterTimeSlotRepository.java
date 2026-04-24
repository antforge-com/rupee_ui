package com.rupee.repository;

import com.rupee.entity.MasterTimeSlot;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MasterTimeSlotRepository extends JpaRepository<MasterTimeSlot, Long> {
    boolean existsByTimeRangeIgnoreCase(String timeRange);

    // ✅ OPTIONAL: If you ever want to search AND paginate at the same time!
    Page<MasterTimeSlot> findByTimeRangeContainingIgnoreCase(String keyword, Pageable pageable);
}