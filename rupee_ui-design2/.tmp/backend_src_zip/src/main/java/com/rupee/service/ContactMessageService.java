package com.rupee.service;

import com.rupee.dto.request.ContactMessageRequest;
import com.rupee.dto.response.ContactMessageResponse;
import com.rupee.entity.ContactMessage;
import com.rupee.repository.ContactMessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Slf4j
@Service
@RequiredArgsConstructor
public class ContactMessageService {

    private final ContactMessageRepository repository;

    // === PUBLIC ACTION ===
    @Transactional
    public void saveMessage(ContactMessageRequest request) {
        ContactMessage message = new ContactMessage();
        message.setName(request.getName());
        message.setEmail(request.getEmail());
        message.setMessage(request.getMessage());

        repository.save(message);
        log.info("New contact message received from: {}", request.getEmail());
    }

    // === ADMIN ACTIONS ===
    @Transactional(readOnly = true)
    public Page<ContactMessageResponse> getAllMessages(Pageable pageable) {
        return repository.findAll(pageable).map(this::mapToResponse);
    }

    @Transactional
    public ContactMessageResponse markAsRead(Long id) {
        ContactMessage message = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found"));

        message.setRead(true);
        return mapToResponse(repository.save(message));
    }

    private ContactMessageResponse mapToResponse(ContactMessage msg) {
        return ContactMessageResponse.builder()
                .id(msg.getId())
                .name(msg.getName())
                .email(msg.getEmail())
                .message(msg.getMessage())
                .isRead(msg.isRead())
                .createdAt(msg.getCreatedAt())
                .build();
    }
}