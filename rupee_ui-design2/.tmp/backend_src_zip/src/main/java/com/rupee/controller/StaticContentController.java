package com.rupee.controller;

import com.rupee.dto.request.StaticContentRequest;
import com.rupee.dto.response.StaticContentResponse;
import com.rupee.service.StaticContentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/static-content")
@RequiredArgsConstructor
public class StaticContentController {

    private final StaticContentService staticContentService;

    // == PUBLIC ENDPOINTS (For the Frontend Developer) ==

    // Example URL: GET /api/static-content/PRIVACY_POLICY
    @GetMapping("/{contentType}")
    public ResponseEntity<StaticContentResponse> getContent(@PathVariable String contentType) {
        return ResponseEntity.ok(staticContentService.getContentByType(contentType));
    }

    // Fetches all static pages (useful for building Footer link menus)
    @GetMapping
    public ResponseEntity<List<StaticContentResponse>> getAllContent() {
        return ResponseEntity.ok(staticContentService.getAllContent());
    }

    // == ADMIN ENDPOINT (Should be secured in your SecurityConfig) ==

    @PostMapping
    public ResponseEntity<StaticContentResponse> createOrUpdateContent(@Valid @RequestBody StaticContentRequest request) {
        return ResponseEntity.ok(staticContentService.upsertContent(request));
    }
}