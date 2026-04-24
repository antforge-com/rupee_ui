package com.rupee.controller;

import com.rupee.dto.request.AnswerSubmissionRequest;
import com.rupee.dto.response.AnswerResponse;
import com.rupee.service.AnswerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class AnswerController {

    private final AnswerService answerService;

    // USER: Submit their answers (Soft-deletes old answers for these exact questions and saves the new ones)
    @PostMapping("/answers")
    public ResponseEntity<Map<String, String>> submitAnswers(@Valid @RequestBody AnswerSubmissionRequest request) {
        answerService.submitAnswers(request);
        return ResponseEntity.ok(Map.of("message", "Answers submitted successfully"));
    }

    // ✅ UPDATED: Now requires ?type=NORMAL or ?type=SPECIAL in the URL
    // Example: GET /api/users/1/bookings/5/answers?type=SPECIAL
    @GetMapping("/users/{userId:[0-9]+}/bookings/{bookingId:[0-9]+}/answers")
    public ResponseEntity<List<AnswerResponse>> getAnswersForBooking(
            @PathVariable Long userId,
            @PathVariable Long bookingId,
            @RequestParam(defaultValue = "NORMAL") String type) { // Defaults to NORMAL if not provided
        return ResponseEntity.ok(answerService.getAnswersForBooking(userId, bookingId, type));
    }
}