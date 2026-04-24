package com.rupee.controller;

import com.rupee.dto.request.FeedbackRequest;
import com.rupee.dto.response.FeedbackResponse;
import com.rupee.service.FeedbackService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@CrossOrigin(origins = "*") // ✅ ADD THIS TO FIX THE CORS ERROR
@RestController
@RequestMapping("/api/feedbacks")
@RequiredArgsConstructor
public class FeedbackController {

    private final FeedbackService feedbackService;

    // --- CREATE ---
    @PostMapping
    public ResponseEntity<FeedbackResponse> submitFeedback(@Valid @RequestBody FeedbackRequest request) {
        FeedbackResponse response = feedbackService.createFeedback(request);
        return new ResponseEntity<>(response, HttpStatus.CREATED);
    }

    // --- READ (Specific Finders) ---
    @GetMapping("/consultant/{consultantId}")
    public ResponseEntity<List<FeedbackResponse>> getConsultantFeedbacks(@PathVariable Long consultantId) {
        return ResponseEntity.ok(feedbackService.getFeedbackByConsultant(consultantId));
    }

    @GetMapping("/meeting/{meetingId}")
    public ResponseEntity<FeedbackResponse> getMeetingFeedback(@PathVariable Long meetingId) {
        return ResponseEntity.ok(feedbackService.getFeedbackByMeeting(meetingId));
    }

    // --- READ BY BOOKING (New) ---
    @GetMapping("/booking/{bookingId}")
    public ResponseEntity<FeedbackResponse> getBookingFeedback(@PathVariable Long bookingId) {
        return ResponseEntity.ok(feedbackService.getFeedbackByBooking(bookingId));
    }

    // --- READ ALL ---
    @GetMapping
    public ResponseEntity<List<FeedbackResponse>> getAllFeedbacks() {
        return ResponseEntity.ok(feedbackService.getAllFeedbacks());
    }

    @GetMapping("/public/highest-rated")
    public ResponseEntity<List<FeedbackResponse>> getHighestRatedFeedbacks(
            @RequestParam(defaultValue = "5") int limit) { // Defaults to 5 reviews if frontend doesn't specify

        // 1. Prevent Exceptions: If they ask for 0 or negative, default to 5
        if (limit <= 0) {
            limit = 5;
        }

        // 2. Protect the Database: Hard cap at 50 reviews max
        if (limit > 50) {
            limit = 50;
        }

        return ResponseEntity.ok(feedbackService.getHighestRatedFeedbacks(limit));
    }

    // --- READ BY ID ---
    @GetMapping("/{id}")
    public ResponseEntity<FeedbackResponse> getFeedbackById(@PathVariable Long id) {
        return ResponseEntity.ok(feedbackService.getFeedbackById(id));
    }

    // --- UPDATE ---
    @PutMapping("/{id}")
    public ResponseEntity<FeedbackResponse> updateFeedback(
            @PathVariable Long id,
            @Valid @RequestBody FeedbackRequest request) {
        return ResponseEntity.ok(feedbackService.updateFeedback(id, request));
    }

    // --- DELETE ---
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteFeedback(@PathVariable Long id) {
        feedbackService.deleteFeedback(id);
        return ResponseEntity.noContent().build(); // Returns a 204 No Content status on success
    }
}