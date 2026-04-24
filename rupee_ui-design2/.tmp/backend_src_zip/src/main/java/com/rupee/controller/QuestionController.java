package com.rupee.controller;

import com.rupee.dto.request.QuestionRequest;
import com.rupee.dto.response.QuestionResponse;
import com.rupee.service.QuestionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/questions")
@RequiredArgsConstructor
public class QuestionController {

    private final QuestionService questionService;

    // ADMIN ONLY: Create a question
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    public ResponseEntity<QuestionResponse> createQuestion(@Valid @RequestBody QuestionRequest request) {
        return ResponseEntity.ok(questionService.createQuestion(request));
    }

    // ADMIN ONLY: Update a question
    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id:[0-9]+}")
    public ResponseEntity<QuestionResponse> updateQuestion(@PathVariable Long id, @Valid @RequestBody QuestionRequest request) {
        return ResponseEntity.ok(questionService.updateQuestion(id, request));
    }

    // ADMIN ONLY: Soft Delete a question (also soft-deletes related answers)
    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id:[0-9]+}")
    public ResponseEntity<Void> deleteQuestion(@PathVariable Long id) {
        questionService.deleteQuestion(id);
        return ResponseEntity.noContent().build();
    }

    // PUBLIC/USER: Fetch ALL ACTIVE standalone questions
    @GetMapping
    public ResponseEntity<List<QuestionResponse>> getAllActiveQuestions() {
        return ResponseEntity.ok(questionService.getAllActiveQuestions());
    }
}