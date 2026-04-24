package com.rupee.repository;

import com.rupee.entity.Feedback;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public interface FeedbackRepository extends JpaRepository<Feedback, Long> {

    List<Feedback> findByConsultantId(Long consultantId);

    List<Feedback> findByUserId(Long userId);

    Optional<Feedback> findByMeetingId(Long meetingId); // Assuming one feedback per meeting

    Optional<Feedback> findByBookingId(Long bookingId); // Assuming one feedback per booking

    // ✅ ADD THIS: Automatically calculates the average rating!
    @Query("SELECT AVG(f.rating) FROM Feedback f WHERE f.consultantId = :consultantId")
    Double calculateAverageRatingByConsultantId(@Param("consultantId") Long consultantId);

    // ==========================================
    // 📊 SATISFACTION PROJECTIONS
    // ==========================================
    interface RatingDistributionData {
        Integer getRating();
        Long getCount();
    }

    @Query("SELECT f.rating AS rating, COUNT(f) AS count " +
            "FROM Feedback f WHERE f.createdAt >= :startDate GROUP BY f.rating")
    List<RatingDistributionData> getRatingDistribution(@Param("startDate") LocalDateTime startDate);

    @Query("SELECT f FROM Feedback f WHERE f.rating >= 4 AND f.comments IS NOT NULL AND TRIM(f.comments) != '' ORDER BY f.rating DESC, f.createdAt DESC")
    List<Feedback> findTopRatedFeedbacksWithComments(Pageable pageable); // <-- Changed Page to List

    // --- NEW ANALYTICS QUERIES ---

    // 1. Average Rating for Consultant overview card
    @Query("SELECT COALESCE(AVG(f.rating), 0.0) FROM Feedback f WHERE f.consultantId = :consultantId")
    Double getAverageRatingForConsultant(@Param("consultantId") Long consultantId);

    // 2. Rating Distribution (e.g., how many 5 stars, 4 stars) for pie/bar charts
    @Query("SELECT new map(f.rating as rating, COUNT(f.id) as count) " +
            "FROM Feedback f WHERE f.consultantId = :consultantId GROUP BY f.rating")
    List<Map<String, Object>> getRatingDistributionForConsultant(@Param("consultantId") Long consultantId);

    // Fetch the most recent reviews for the Dashboard Feed
    List<Feedback> findByConsultantIdOrderByCreatedAtDesc(Long consultantId, Pageable pageable);

    // Admin Widget: Top Rated Consultants (Requires at least 1 review)
    @Query("SELECT new map(f.consultantId as consultantId, AVG(f.rating) as avgRating, COUNT(f.id) as totalReviews) " +
            "FROM Feedback f GROUP BY f.consultantId HAVING COUNT(f.id) > 0 ORDER BY AVG(f.rating) DESC")
    List<Map<String, Object>> getTopRatedConsultants(Pageable pageable);
}