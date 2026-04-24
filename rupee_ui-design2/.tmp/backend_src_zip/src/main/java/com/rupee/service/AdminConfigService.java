package com.rupee.service;

import com.rupee.dto.request.CannedResponseRequest;
import com.rupee.dto.request.TicketCategoryRequest;
import com.rupee.dto.response.CannedResponseResponse;
import com.rupee.dto.response.TicketCategoryResponse;
import com.rupee.entity.CannedResponse;
import com.rupee.entity.TicketCategory;
import com.rupee.repository.CannedResponseRepository;
import com.rupee.repository.TicketCategoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AdminConfigService {

    private final CannedResponseRepository cannedResponseRepository;
    private final TicketCategoryRepository ticketCategoryRepository;

    // ==========================================
    // 1. CANNED RESPONSES LOGIC
    // ==========================================

    public List<CannedResponseResponse> getCannedResponses(String category) {
        List<CannedResponse> responses = (category != null && !category.isBlank())
                ? cannedResponseRepository.findByCategory(category)
                : cannedResponseRepository.findAll();

        // Map Entities to secure DTOs
        return responses.stream()
                .map(r -> new CannedResponseResponse(r.getId(), r.getTitle(), r.getContent(), r.getCategory(), r.getCreatedAt()))
                .toList();
    }

    @Transactional
    public CannedResponseResponse createCannedResponse(CannedResponseRequest request) {
        CannedResponse entity = new CannedResponse();
        entity.setTitle(request.getTitle());
        entity.setContent(request.getContent());
        entity.setCategory(request.getCategory());

        CannedResponse saved = cannedResponseRepository.save(entity);
        return new CannedResponseResponse(saved.getId(), saved.getTitle(), saved.getContent(), saved.getCategory(), saved.getCreatedAt());
    }

    @Transactional
    public void deleteCannedResponse(Long id) {
        cannedResponseRepository.deleteById(id);
    }

    // ==========================================
    // 2. TICKET CATEGORIES LOGIC
    // ==========================================

    public List<TicketCategoryResponse> getActiveCategories() {
        // Map Entities to secure DTOs
        return ticketCategoryRepository.findByIsActiveTrueOrderByNameAsc().stream()
                .map(c -> new TicketCategoryResponse(c.getId(), c.getName(), c.getDescription(), c.isActive()))
                .toList();
    }

    @Transactional
    public TicketCategoryResponse createCategory(TicketCategoryRequest request) {
        TicketCategory entity = new TicketCategory();
        entity.setName(request.getName());
        entity.setDescription(request.getDescription());
        entity.setActive(true); // Always true on creation

        TicketCategory saved = ticketCategoryRepository.save(entity);
        return new TicketCategoryResponse(saved.getId(), saved.getName(), saved.getDescription(), saved.isActive());
    }

    @Transactional
    public TicketCategoryResponse toggleCategory(Long id) {
        TicketCategory category = ticketCategoryRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Category not found"));

        category.setActive(!category.isActive());
        TicketCategory saved = ticketCategoryRepository.save(category);

        return new TicketCategoryResponse(saved.getId(), saved.getName(), saved.getDescription(), saved.isActive());
    }
}