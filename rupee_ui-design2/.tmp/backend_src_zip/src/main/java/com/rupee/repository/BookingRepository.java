package com.rupee.repository;

import com.rupee.dto.response.BookingResponse;
import com.rupee.entity.Booking;
import com.rupee.enums.BookingEnums.BookingStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public interface BookingRepository extends JpaRepository<Booking, Long> {
    // ==========================================
    // 🚀 ULTRA-FAST DTO PROJECTIONS
    // ==========================================

    // This tells Hibernate to skip mapping Entities and build the Response immediately.
    // Order of variables MUST exactly match the variables in BookingResponse.java!
    // Changed b.timeSlotId to b.timeSlotIds to match the updated Entity
    String DTO_SELECT = "SELECT new com.rupee.dto.response.BookingResponse(" +
            "b.id, b.userId, b.consultantId, b.timeSlotIds, b.totalAmount, b.discountAmount, " +
            "b.offerId, b.bookingStatus, b.paymentStatus, b.meetingMode, " +
            "b.meetingLink, b.meetingId, b.meetingNotes, b.userNotes, b.version) " +
            "FROM Booking b ";

    @Query(DTO_SELECT)
    Page<BookingResponse> findAllDTO(Pageable pageable);

    @Query(DTO_SELECT + "WHERE b.id = :id")
    Optional<BookingResponse> findBookingByIdDTO(@Param("id") Long id);

    // Used only by Admins to monitor system-wide status, with the same pagination as the Entity version
    @Query(DTO_SELECT + "WHERE b.bookingStatus = :status")
    Page<BookingResponse> findByBookingStatusDTO(@Param("status") BookingStatus status, Pageable pageable);

    // Filters by User/Consultant AND Status to prevent data leaks, with the same pagination as the Entity version
    @Query(DTO_SELECT + "WHERE b.userId = :userId AND b.bookingStatus = :status")
    Page<BookingResponse> findByUserIdAndBookingStatusDTO(@Param("userId") Long userId, @Param("status") BookingStatus status, Pageable pageable);

    @Query(DTO_SELECT + "WHERE b.consultantId = :consultantId AND b.bookingStatus = :status")
    Page<BookingResponse> findByConsultantIdAndBookingStatusDTO(@Param("consultantId") Long consultantId, @Param("status") BookingStatus status, Pageable pageable);

    // Base finders for profile/dashboard views (without status filter), with the same pagination as the Entity version
    @Query(DTO_SELECT + "WHERE b.userId = :userId")
    Page<BookingResponse> findByUserIdDTO(@Param("userId") Long userId, Pageable pageable);

    @Query(DTO_SELECT + "WHERE b.consultantId = :consultantId")
    Page<BookingResponse> findByConsultantIdDTO(@Param("consultantId") Long consultantId, Pageable pageable);

    // ==========================================
    // 🛡️ UTILITY & SECURITY (Unchanged)
    // ==========================================

    // UTILITY: Used for validation logic
    boolean existsByConsultantId(Long consultantId);

    // NEW SECURITY: Checks if the user has already successfully used this offer (ignoring cancelled ones)
    boolean existsByUserIdAndOfferIdAndBookingStatusNot(Long userId, Long offerId, BookingStatus status);

    // ==========================================
    // 📊 REVENUE PROJECTIONS
    // ==========================================
    interface BookingRevenueData {
        Long getConsultantId();
        Long getTotalBookings();
        Long getCompletedBookings();
        java.math.BigDecimal getTotalRevenue();
    }

    @Query("SELECT b.consultantId AS consultantId, COUNT(b) AS totalBookings, " +
            "SUM(CASE WHEN b.bookingStatus = 'COMPLETED' THEN 1 ELSE 0 END) AS completedBookings, " +
            "SUM(CASE WHEN b.bookingStatus = 'COMPLETED' THEN b.totalAmount ELSE 0 END) AS totalRevenue " +
            "FROM Booking b WHERE b.createdAt >= :startDate GROUP BY b.consultantId")
    List<BookingRevenueData> getBookingRevenueByConsultant(@Param("startDate") LocalDateTime startDate);

    // --- SUMMARY CARD QUERIES ---
    long countByBookingStatus(BookingStatus status);

    @Query("SELECT COALESCE(SUM(b.totalAmount), 0) FROM Booking b WHERE b.bookingStatus = 'COMPLETED'")
    BigDecimal calculateTotalRevenue();

    // --- NEW ANALYTICS QUERIES ---

    // 1. Consultant: Revenue Chart Data (Monthly)
    @Query("SELECT new map(MONTH(b.createdAt) as month, COALESCE(SUM(b.totalAmount), 0) as revenue) " +
            "FROM Booking b WHERE b.consultantId = :consultantId AND b.paymentStatus = 'SUCCESS' " +
            "AND YEAR(b.createdAt) = YEAR(CURRENT_DATE) GROUP BY MONTH(b.createdAt)")
    List<Map<String, Object>> getMonthlyRevenueForConsultant(@Param("consultantId") Long consultantId);

    // 2. Admin: Platform Revenue Chart Data (Monthly)
    @Query("SELECT new map(MONTH(b.createdAt) as month, COALESCE(SUM(b.totalAmount), 0) as revenue) " +
            "FROM Booking b WHERE b.paymentStatus = 'SUCCESS' " +
            "AND YEAR(b.createdAt) = YEAR(CURRENT_DATE) GROUP BY MONTH(b.createdAt)")
    List<Map<String, Object>> getPlatformMonthlyRevenue();

    // Admin: Platform Booking Activity Chart Data (Monthly)
    @Query("SELECT new map(MONTH(b.createdAt) as month, COUNT(b) as count) " +
            "FROM Booking b WHERE b.paymentStatus = 'SUCCESS' " +
            "AND b.bookingStatus != 'CANCELLED' " +
            "AND YEAR(b.createdAt) = YEAR(CURRENT_DATE) GROUP BY MONTH(b.createdAt)")
    List<Map<String, Object>> getPlatformMonthlyBookingActivity();

    // 3. Admin: Top Consultants by Revenue
    @Query("SELECT new map(b.consultantId as consultantId, COALESCE(SUM(b.totalAmount), 0) as totalRevenue, COUNT(b.id) as totalBookings) " +
            "FROM Booking b WHERE b.paymentStatus = 'SUCCESS' " +
            "GROUP BY b.consultantId ORDER BY SUM(b.totalAmount) DESC")
    List<Map<String, Object>> getTopConsultantsByRevenue(Pageable pageable);

    // 4. Counts for Overview Cards
    long countByConsultantIdAndBookingStatus(Long consultantId, BookingStatus status);

    @Query("SELECT COALESCE(SUM(b.totalAmount), 0) FROM Booking b WHERE b.consultantId = :consultantId AND b.paymentStatus = 'SUCCESS'")
    BigDecimal calculateTotalRevenueByConsultant(@Param("consultantId") Long consultantId);

    // 5. Recent Bookings
    List<Booking> findByConsultantIdOrderByCreatedAtDesc(Long consultantId, Pageable pageable);
    List<Booking> findAllByOrderByCreatedAtDesc(Pageable pageable);

    long countByConsultantId(Long consultantId);

    // ==========================================
    // 👤 USER ANALYTICS QUERIES (GUEST/MEMBER/SUBSCRIBER)
    // ==========================================

    long countByUserIdAndBookingStatus(Long userId, BookingStatus status);

    @Query("SELECT COALESCE(SUM(b.totalAmount), 0) FROM Booking b WHERE b.userId = :userId AND b.paymentStatus = 'SUCCESS'")
    BigDecimal calculateTotalSpentByUser(@Param("userId") Long userId);

    @Query("SELECT COALESCE(SUM(b.discountAmount), 0) FROM Booking b WHERE b.userId = :userId AND b.paymentStatus = 'SUCCESS'")
    BigDecimal calculateTotalSavedByUser(@Param("userId") Long userId);

    List<Booking> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);

    // --- MISSING CONSULTANT CHART QUERY ---
    @Query("SELECT new map(MONTH(b.createdAt) as month, COUNT(b) as count) " +
            "FROM Booking b WHERE b.consultantId = :consultantId " +
            "AND b.paymentStatus = 'SUCCESS' " + // <-- ADD THIS LINE
            "AND b.bookingStatus != 'CANCELLED' " + // <-- (Optional) Exclude cancellations
            "AND YEAR(b.createdAt) = YEAR(CURRENT_DATE) GROUP BY MONTH(b.createdAt)")
    List<Map<String, Object>> getMonthlyBookingActivityForConsultant(@Param("consultantId") Long consultantId);

    // --- MISSING USER CHART QUERIES ---
    @Query("SELECT new map(MONTH(b.createdAt) as month, COALESCE(SUM(b.totalAmount), 0) as revenue) " +
            "FROM Booking b WHERE b.userId = :userId AND b.paymentStatus = 'SUCCESS' " +
            "AND YEAR(b.createdAt) = YEAR(CURRENT_DATE) GROUP BY MONTH(b.createdAt)")
    List<Map<String, Object>> getMonthlySpendingForUser(@Param("userId") Long userId);

    @Query("SELECT new map(MONTH(b.createdAt) as month, COUNT(b) as count) " +
            "FROM Booking b WHERE b.userId = :userId " +
            "AND b.paymentStatus = 'SUCCESS' " +            // ✅ ADDED: Only count paid sessions
            "AND b.bookingStatus != 'CANCELLED' " +         // ✅ ADDED: Exclude cancellations
            "AND YEAR(b.createdAt) = YEAR(CURRENT_DATE) GROUP BY MONTH(b.createdAt)")
    List<Map<String, Object>> getMonthlyBookingActivityForUser(@Param("userId") Long userId);

    // --- MISSING UI WIDGET QUERIES ---

    // 1. Consultant: Revenue by Meeting Mode (Pie Chart)
    @Query("SELECT new map(CAST(b.meetingMode AS string) as mode, COALESCE(SUM(b.totalAmount), 0) as revenue) " +
            "FROM Booking b WHERE b.consultantId = :consultantId AND b.paymentStatus = 'SUCCESS' " +
            "GROUP BY b.meetingMode")
    List<Map<String, Object>> getRevenueByMeetingModeForConsultant(@Param("consultantId") Long consultantId);

    // 2. Admin: Platform Revenue by Meeting Mode (Pie Chart)
    @Query("SELECT new map(CAST(b.meetingMode AS string) as mode, COALESCE(SUM(b.totalAmount), 0) as revenue) " +
            "FROM Booking b WHERE b.paymentStatus = 'SUCCESS' " +
            "GROUP BY b.meetingMode")
    List<Map<String, Object>> getPlatformRevenueByMeetingMode();

    // 3. Upcoming Appointments (Using CONFIRMED status)
    List<Booking> findByConsultantIdAndBookingStatusOrderByCreatedAtDesc(Long consultantId, BookingStatus status, Pageable pageable);
    List<Booking> findByUserIdAndBookingStatusOrderByCreatedAtDesc(Long userId, BookingStatus status, Pageable pageable);
}