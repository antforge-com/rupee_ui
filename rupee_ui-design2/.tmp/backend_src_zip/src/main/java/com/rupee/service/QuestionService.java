package com.rupee.service;

import com.rupee.dto.request.QuestionRequest;
import com.rupee.dto.response.QuestionResponse;
import com.rupee.entity.Question;
import com.rupee.repository.AnswerRepository;
import com.rupee.repository.QuestionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@RequiredArgsConstructor
public class QuestionService {

    private final QuestionRepository questionRepository;
    private final AnswerRepository answerRepository;

    @Transactional
    public QuestionResponse createQuestion(QuestionRequest request) {
        Question question = new Question();
        applyRequestToEntity(request, question); // ✅ Using a helper method for cleaner code

        // ✅ Set active on creation
        question.setActive(true);

        // Fallback to "radio" if the frontend sends a null or empty type on creation
        if (question.getType() == null || question.getType().isBlank()) {
            question.setType("radio");
        }

        Question saved = questionRepository.save(question);
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<QuestionResponse> getAllActiveQuestions() {
        // ✅ Only fetch active questions
        return questionRepository.findByIsActiveTrue().stream()
                .map(this::toResponse) // ✅ Using helper method
                .toList();
    }

    @Transactional
    public QuestionResponse updateQuestion(Long id, QuestionRequest request) {
        Question question = questionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Question not found"));

        applyRequestToEntity(request, question);

        Question updated = questionRepository.save(question);
        return toResponse(updated);
    }

    @Transactional
    public void deleteQuestion(Long id) {
        Question question = questionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Question not found"));

        // 1. Soft delete the question
        question.setActive(false);
        questionRepository.save(question);

        // 2. Safely soft delete all answers associated with this question
        answerRepository.softDeleteByQuestionId(id);
    }

    // ==========================================
    // ✅ HELPER METHODS TO KEEP CODE DRY
    // ==========================================

    private void applyRequestToEntity(QuestionRequest request, Question entity) {
        entity.setText(request.getText());
        entity.setType(request.getType());
        entity.setOptions(request.getOptions());
        entity.setPlaceholder(request.getPlaceholder());
    }

    private QuestionResponse toResponse(Question entity) {
        return new QuestionResponse(
                entity.getId(),
                entity.getText(),
                entity.getType(),
                entity.getOptions(),
                entity.getPlaceholder(),
                entity.getUpdatedAt()
        );
    }
}