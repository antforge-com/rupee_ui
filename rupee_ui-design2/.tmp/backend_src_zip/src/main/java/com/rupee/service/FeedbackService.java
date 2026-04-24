package com.rupee.service;

import com.rupee.dto.request.FeedbackRequest;
import com.rupee.dto.response.FeedbackResponse;
import com.rupee.entity.Feedback;
import com.rupee.entity.User;
import com.rupee.enums.UserEnums.Role;
import com.rupee.repository.ConsultantRepository;
import com.rupee.repository.FeedbackRepository;
import com.rupee.repository.FeedbackRepository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class FeedbackService {

    private final FeedbackRepository feedbackRepository;
    private final ConsultantRepository consultantRepository; // ✅ Injected for Rating updates
    private final SecurityService securityService; // ✅ Injected for secure Identity extraction

    // --- CONSTANTS ---
    private static final String FEEDBACK_NOT_FOUND_MSG = "Feedback not found with ID: ";

    // --- CREATE ---
    @Transactional
    public FeedbackResponse createFeedback(FeedbackRequest request) {

        // ✅ SECURE IDENTIFICATION: Get the user ID from the JWT token, NOT the frontend request!
        User currentUser = securityService.getCurrentUser();
        Long authenticatedUserId = currentUser.getId();

        // ✅ PREVENT 500 ERRORS: Check for duplicate submissions
        if (request.getBookingId() != null) {
            Optional<Feedback> existing = feedbackRepository.findByBookingId(request.getBookingId());
            if (existing.isPresent()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Feedback has already been submitted for this booking.");
            }
        } else if (request.getMeetingId() != null) {
            Optional<Feedback> existing = feedbackRepository.findByMeetingId(request.getMeetingId());
            if (existing.isPresent()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Feedback has already been submitted for this meeting.");
            }
        }

        Feedback feedback = new Feedback();

        // ✅ Setting the securely extracted User ID
        feedback.setUserId(authenticatedUserId);

        feedback.setConsultantId(request.getConsultantId());
        feedback.setMeetingId(request.getMeetingId());
        feedback.setBookingId(request.getBookingId());
        feedback.setRating(request.getRating());
        feedback.setComments(request.getComments());

        Feedback savedFeedback = feedbackRepository.save(feedback);

        // ✅ RECALCULATE RATING AUTOMATICALLY
        updateConsultantAverageRating(request.getConsultantId());

        // ✅ SMART LOGGING
        if (savedFeedback.getRating() != null && savedFeedback.getRating() < 3) {
            log.warn("POOR SERVICE ALERT: Consultant ID {} received a {} star rating for Booking ID {}. Comments: '{}'",
                    savedFeedback.getConsultantId(), savedFeedback.getRating(), savedFeedback.getBookingId(), savedFeedback.getComments());
        }

        return mapToResponse(savedFeedback);
    }

    // --- READ (Specific Finders) ---
    @Transactional(readOnly = true)
    public List<FeedbackResponse> getFeedbackByConsultant(Long consultantId) {
        return feedbackRepository.findByConsultantId(consultantId).stream()
                .map(this::mapToResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public FeedbackResponse getFeedbackByMeeting(Long meetingId) {
        Feedback feedback = feedbackRepository.findByMeetingId(meetingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Feedback not found for meeting ID: " + meetingId));
        return mapToResponse(feedback);
    }

    @Transactional(readOnly = true)
    public FeedbackResponse getFeedbackByBooking(Long bookingId) {
        Feedback feedback = feedbackRepository.findByBookingId(bookingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Feedback not found for booking ID: " + bookingId));
        return mapToResponse(feedback);
    }

    // --- READ ALL ---
    @Transactional(readOnly = true)
    public List<FeedbackResponse> getAllFeedbacks() {
        return feedbackRepository.findAll().stream()
                .map(this::mapToResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<FeedbackResponse> getHighestRatedFeedbacks(int limit) {
        // Fetch the top N results based on the limit requested by the frontend
        Pageable pageable = PageRequest.of(0, limit);

        // This now runs 1 fast SQL query instead of 2!
        return feedbackRepository.findTopRatedFeedbacksWithComments(pageable)
                .stream()
                .map(this::mapToResponse) // Uses your existing mapping logic
                .toList();
    }

    // --- READ BY ID ---
    @Transactional(readOnly = true)
    public FeedbackResponse getFeedbackById(Long id) {
        Feedback feedback = feedbackRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, FEEDBACK_NOT_FOUND_MSG + id));
        return mapToResponse(feedback);
    }

    // --- UPDATE ---
    @Transactional
    public FeedbackResponse updateFeedback(Long id, FeedbackRequest request) {
        Feedback feedback = feedbackRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, FEEDBACK_NOT_FOUND_MSG + id));

        // ✅ SECURITY CHECK: Only the user who wrote the review (or an ADMIN) can update it
        User currentUser = securityService.getCurrentUser();
        if (!feedback.getUserId().equals(currentUser.getId()) && currentUser.getRole() != Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to update this feedback.");
        }

        // Notice we DO NOT update the userId here. It remains securely tied to the original creator.
        feedback.setConsultantId(request.getConsultantId());
        feedback.setMeetingId(request.getMeetingId());
        feedback.setBookingId(request.getBookingId());
        feedback.setRating(request.getRating());
        feedback.setComments(request.getComments());

        Feedback updatedFeedback = feedbackRepository.save(feedback);

        // ✅ RECALCULATE RATING AUTOMATICALLY (In case they changed a 1-star to a 5-star)
        updateConsultantAverageRating(updatedFeedback.getConsultantId());

        return mapToResponse(updatedFeedback);
    }

    // --- DELETE ---
    @Transactional
    public void deleteFeedback(Long id) {
        Feedback feedback = feedbackRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, FEEDBACK_NOT_FOUND_MSG + id));

        // ✅ SECURITY CHECK: Only the user who wrote the review (or an ADMIN) can delete it
        User currentUser = securityService.getCurrentUser();
        if (!feedback.getUserId().equals(currentUser.getId()) && currentUser.getRole() != Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to delete this feedback.");
        }

        Long consultantId = feedback.getConsultantId(); // Save ID before deleting
        feedbackRepository.delete(feedback);

        // ✅ RECALCULATE RATING AUTOMATICALLY
        updateConsultantAverageRating(consultantId);
    }

    // ==========================================
    // ✅ NEW PRIVATE HELPER: The Math Engine
    // ==========================================
    private void updateConsultantAverageRating(Long consultantId) {
        Double rawAverage = feedbackRepository.calculateAverageRatingByConsultantId(consultantId);

        // Calculate the final value into a variable that is only assigned ONCE (effectively final)
        Double finalRating = (rawAverage == null)
                ? 5.0
                : Math.round(rawAverage * 10.0) / 10.0;

        // Fetch the consultant and update their rating!
        consultantRepository.findById(consultantId).ifPresent(consultant -> {
            consultant.setRating(finalRating); // ✅ Now using the effectively final variable
            consultantRepository.save(consultant);
        });
    }

    // ==========================================
    // 📊 DASHBOARD: CUSTOMER SATISFACTION (TAB 3)
    // ==========================================
    public Map<String, Object> getSatisfactionAnalytics(int days) {
        LocalDateTime startDate = LocalDateTime.now().minusDays(days);

        // Ensure you import com.rupee.repository.FeedbackRepository.RatingDistributionData
        List<RatingDistributionData> distribution = feedbackRepository.getRatingDistribution(startDate);

        long totalReviews = distribution.stream().mapToLong(RatingDistributionData::getCount).sum();
        long fiveStarCount = distribution.stream().filter(d -> d.getRating() == 5).mapToLong(FeedbackRepository.RatingDistributionData::getCount).sum();

        double sumProduct = distribution.stream().mapToDouble(d -> d.getRating() * d.getCount()).sum();
        double avgRating = totalReviews > 0 ? sumProduct / totalReviews : 0.0;

        // Map 1-5 stars cleanly for the UI bars
        Map<Integer, Long> ratingMap = new HashMap<>();
        for(int i=1; i<=5; i++) ratingMap.put(i, 0L);
        distribution.forEach(d -> ratingMap.put(d.getRating(), d.getCount()));

        return Map.of("totalReviews", totalReviews, "fiveStarCount", fiveStarCount,
                "avgRating", Math.round(avgRating * 10.0) / 10.0, "distribution", ratingMap);
    }

    // --- UTILITY ---
    private FeedbackResponse mapToResponse(Feedback feedback) {
        return new FeedbackResponse(
                feedback.getId(),
                feedback.getUserId(),
                feedback.getConsultantId(),
                feedback.getMeetingId(),
                feedback.getBookingId(),
                feedback.getRating(),
                feedback.getComments()
        );
    }
}