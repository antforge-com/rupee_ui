package com.rupee.repository;

import com.rupee.entity.ContactMessage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ContactMessageRepository extends JpaRepository<ContactMessage, Long> {
    // Allows admin to filter by unread messages easily
    Page<ContactMessage> findByIsRead(boolean isRead, Pageable pageable);
}