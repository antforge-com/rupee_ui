package com.rupee.service;

import com.rupee.dto.request.StaticContentRequest;
import com.rupee.dto.response.StaticContentResponse;
import com.rupee.entity.StaticContent;
import com.rupee.repository.StaticContentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@RequiredArgsConstructor
public class StaticContentService {

    private final StaticContentRepository staticContentRepository;

    @Transactional
    public StaticContentResponse upsertContent(StaticContentRequest request) {
        // Fetch existing content to update, or create a brand new entity
        StaticContent content = staticContentRepository.findByContentType(request.getContentType())
                .orElse(new StaticContent());

        content.setContentType(request.getContentType());
        content.setContent(request.getContent());
        content.setLastUpdatedBy(request.getLastUpdatedBy());

        StaticContent savedContent = staticContentRepository.save(content);
        return mapToResponse(savedContent);
    }

    public StaticContentResponse getContentByType(String contentType) {
        StaticContent content = staticContentRepository.findByContentType(contentType)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Content not found for type: " + contentType));
        return mapToResponse(content);
    }

    public List<StaticContentResponse> getAllContent() {
        return staticContentRepository.findAll().stream()
                .map(this::mapToResponse)
                .toList();
    }

    private StaticContentResponse mapToResponse(StaticContent content) {
        StaticContentResponse response = new StaticContentResponse();
        response.setContentId(content.getContentId());
        response.setContentType(content.getContentType());
        response.setContent(content.getContent());
        response.setLastUpdatedDate(content.getLastUpdatedDate());
        response.setLastUpdatedBy(content.getLastUpdatedBy());
        return response;
    }
}