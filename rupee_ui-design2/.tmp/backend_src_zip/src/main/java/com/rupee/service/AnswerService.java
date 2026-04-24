package com.rupee.service;

import com.rupee.dto.request.AnswerSubmissionRequest;
import com.rupee.dto.response.AnswerResponse;
import com.rupee.entity.Answer;
import com.rupee.entity.Question;
import com.rupee.entity.User;
import com.rupee.repository.AnswerRepository;
import com.rupee.repository.BookingRepository;
import com.rupee.repository.SpecialBookingRepository;
import com.rupee.repository.QuestionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnswerService {

    private final AnswerRepository answerRepository;
    private final SecurityService securityService;
    private final BookingRepository bookingRepository;
    private final SpecialBookingRepository specialBookingRepository;
    private final QuestionRepository questionRepository;

    @Transactional
    public void submitAnswers(AnswerSubmissionRequest request) {
        User currentUser = securityService.getCurrentUser();
        Long userId = currentUser.getId();
        Long bookingId = request.getBookingId();
        String bookingType = request.getBookingType().toUpperCase(); // "NORMAL" or "SPECIAL"

        List<Long> incomingQuestionIds = request.getAnswers().stream()
                .map(AnswerSubmissionRequest.AnswerItem::getQuestionId)
                .toList();

        // 1. 🛡️ SECURITY: Enforce Booking Ownership specifically for the requested type
        Long ownerUserId;

        if ("NORMAL".equals(bookingType)) {
            var standardBooking = bookingRepository.findById(bookingId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Normal Booking not found."));
            ownerUserId = standardBooking.getUserId();
        } else if ("SPECIAL".equals(bookingType)) {
            var specialBooking = specialBookingRepository.findById(bookingId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Special Booking not found."));
            ownerUserId = specialBooking.getUserId();
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid bookingType. Must be 'NORMAL' or 'SPECIAL'.");
        }

        if (!ownerUserId.equals(userId)) {
            // Only log if someone is actively trying to breach data
            log.error("SECURITY AUDIT: User {} attempted to submit answers for {} Booking {} which they do not own.", userId, bookingType, bookingId);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to submit answers for this booking.");
        }

        // 2. 🛡️ VALIDATION: Ensure questions exist
        List<Question> validQuestions = questionRepository.findAllById(incomingQuestionIds);
        long activeQuestionCount = validQuestions.stream().filter(Question::isActive).count();

        if (activeQuestionCount != incomingQuestionIds.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "One or more submitted questions are invalid or inactive.");
        }

        // 3. SCOPED DELETE: Soft-delete old answers for THIS booking ID AND TYPE
        List<Answer> existingAnswers = answerRepository.findByUserIdAndBookingIdAndBookingTypeAndIsActiveTrue(userId, bookingId, bookingType);
        for (Answer oldAnswer : existingAnswers) {
            if (incomingQuestionIds.contains(oldAnswer.getQuestionId())) {
                oldAnswer.setActive(false);
                answerRepository.save(oldAnswer);
            }
        }

        // 4. Save the new answers WITH both bookingId and bookingType
        List<Answer> answersToSave = request.getAnswers().stream().map(item -> {
            Answer answer = new Answer();
            answer.setUserId(userId);
            answer.setBookingId(bookingId);
            answer.setBookingType(bookingType); // ✅ SAVE THE TYPE
            answer.setQuestionId(item.getQuestionId());
            answer.setText(item.getText());
            answer.setActive(true);
            return answer;
        }).toList();

        answerRepository.saveAll(answersToSave);
    }

    @Transactional(readOnly = true)
    public List<AnswerResponse> getAnswersForBooking(Long userId, Long bookingId, String bookingType) {
        return answerRepository.findActiveAnswersForBooking(userId, bookingId, bookingType.toUpperCase()).stream()
                .map(a -> new AnswerResponse(a.getId(), a.getBookingId(), a.getBookingType(), a.getQuestionId(), a.getText(), a.getUpdatedAt()))
                .toList();
    }
}