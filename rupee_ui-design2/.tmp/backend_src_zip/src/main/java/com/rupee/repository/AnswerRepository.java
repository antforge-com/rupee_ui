package com.rupee.repository;

import com.rupee.entity.Answer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param; // ✅ ADDED

import java.util.List;

public interface AnswerRepository extends JpaRepository<Answer, Long> {

    // Fetch all answers for a specific user's profile
    List<Answer> findByUserId(Long userId);

    // Fetch only active answers for a user's profile
    List<Answer> findByUserIdAndIsActiveTrue(Long userId);

    // ==========================================
    // ✅ UPDATED: Fetch Active Answers for a Booking
    // Now ensures Answer is active, Question is active, AND it belongs to a specific booking ID AND TYPE!
    // This prevents data corruption between Normal and Special bookings that happen to share the same database ID.
    // ==========================================
    @Query("SELECT a FROM Answer a, Question q WHERE a.questionId = q.id AND a.userId = :userId AND a.bookingId = :bookingId AND a.bookingType = :bookingType AND a.isActive = true AND q.isActive = true")
    List<Answer> findActiveAnswersForBooking(
            @Param("userId") Long userId,
            @Param("bookingId") Long bookingId,
            @Param("bookingType") String bookingType
    );

    // Bulk Soft Delete Answers for a single deleted question
    @Modifying
    @Query("UPDATE Answer a SET a.isActive = false WHERE a.questionId = :questionId")
    void softDeleteByQuestionId(@Param("questionId") Long questionId);

    // Bulk Soft Delete Answers for multiple questions (Cascading from Skill deletion)
    @Modifying
    @Query("UPDATE Answer a SET a.isActive = false WHERE a.questionId IN :questionIds")
    void softDeleteByQuestionIds(@Param("questionIds") List<Long> questionIds);

    // ==========================================
    // ✅ UPDATED: Scoped Fetch for Soft Deletes
    // Fetch active answers for a specific booking ID and TYPE (used in AnswerService to safely clear old answers)
    // ==========================================
    List<Answer> findByUserIdAndBookingIdAndBookingTypeAndIsActiveTrue(Long userId, Long bookingId, String bookingType);
}