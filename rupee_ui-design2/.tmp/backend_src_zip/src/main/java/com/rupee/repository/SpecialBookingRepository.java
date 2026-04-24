package com.rupee.repository;

import com.rupee.entity.SpecialBooking;
import com.rupee.enums.SpecialBookingStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Repository
public interface SpecialBookingRepository extends JpaRepository<SpecialBooking, Long> {

    Page<SpecialBooking> findByUserId(Long userId, Pageable pageable);

    Page<SpecialBooking> findByConsultantId(Long consultantId, Pageable pageable);

    Page<SpecialBooking> findByStatus(SpecialBookingStatus status, Pageable pageable);

    long countByStatus(SpecialBookingStatus status);

    // ✅ NEW: Fetch all confirmed bookings for a consultant on a specific date to check for overlaps
    @Query("SELECT s FROM SpecialBooking s WHERE s.consultantId = :consultantId AND s.scheduledDate = :date AND s.status IN ('CONFIRMED', 'COMPLETED')")
    List<SpecialBooking> findConfirmedByConsultantAndDate(@Param("consultantId") Long consultantId, @Param("date") LocalDate date);

    boolean existsByConsultantIdAndScheduledDateAndStatus(Long consultantId, LocalDate scheduledDate, SpecialBookingStatus status);

    // ==========================================
    // 📊 ANALYTICS & REVENUE PROJECTIONS
    // ==========================================

    @Query("SELECT COALESCE(SUM(sb.totalAmount), 0) FROM SpecialBooking sb WHERE sb.consultantId = :consultantId AND sb.paymentStatus = 'SUCCESS'")
    BigDecimal calculateTotalRevenueByConsultant(@Param("consultantId") Long consultantId);

    @Query("SELECT COALESCE(SUM(sb.totalAmount), 0) FROM SpecialBooking sb WHERE sb.paymentStatus = 'SUCCESS'")
    BigDecimal calculateTotalPlatformRevenue();

    @Query("SELECT COALESCE(SUM(sb.totalAmount), 0) FROM SpecialBooking sb WHERE sb.userId = :userId AND sb.paymentStatus = 'SUCCESS'")
    BigDecimal calculateTotalSpentByUser(@Param("userId") Long userId);

    @Query("SELECT new map(MONTH(sb.createdAt) as month, COALESCE(SUM(sb.totalAmount), 0) as revenue) " +
            "FROM SpecialBooking sb WHERE sb.consultantId = :consultantId AND sb.paymentStatus = 'SUCCESS' " +
            "AND YEAR(sb.createdAt) = YEAR(CURRENT_DATE) GROUP BY MONTH(sb.createdAt)")
    List<Map<String, Object>> getMonthlyRevenueForConsultant(@Param("consultantId") Long consultantId);

    @Query("SELECT new map(MONTH(sb.createdAt) as month, COALESCE(SUM(sb.totalAmount), 0) as revenue) " +
            "FROM SpecialBooking sb WHERE sb.paymentStatus = 'SUCCESS' " +
            "AND YEAR(sb.createdAt) = YEAR(CURRENT_DATE) GROUP BY MONTH(sb.createdAt)")
    List<Map<String, Object>> getPlatformMonthlyRevenue();

    @Query("SELECT new map(MONTH(sb.createdAt) as month, COALESCE(SUM(sb.totalAmount), 0) as revenue) " +
            "FROM SpecialBooking sb WHERE sb.userId = :userId AND sb.paymentStatus = 'SUCCESS' " +
            "AND YEAR(sb.createdAt) = YEAR(CURRENT_DATE) GROUP BY MONTH(sb.createdAt)")
    List<Map<String, Object>> getMonthlySpendingForUser(@Param("userId") Long userId);

    long countByConsultantIdAndStatus(Long consultantId, com.rupee.enums.SpecialBookingStatus status);
    long countByUserIdAndStatus(Long userId, com.rupee.enums.SpecialBookingStatus status);
    long countByConsultantId(Long consultantId);

    @Query("SELECT COALESCE(SUM(sb.durationInHours), 0) FROM SpecialBooking sb WHERE sb.consultantId = :consultantId AND sb.status = 'COMPLETED'")
    long calculateTotalConsultationHours(@Param("consultantId") Long consultantId);
}