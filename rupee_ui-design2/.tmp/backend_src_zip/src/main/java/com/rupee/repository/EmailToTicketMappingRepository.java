package com.rupee.repository;

import com.rupee.entity.EmailToTicketMapping;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface EmailToTicketMappingRepository extends JpaRepository<EmailToTicketMapping, Long> {

    /**
     * Check if an email has already been processed to prevent duplicates
     */
    Optional<EmailToTicketMapping> findByEmailMessageId(String emailMessageId);

    /**
     * Get all mappings for a specific sender email
     */
    List<EmailToTicketMapping> findBySenderEmail(String senderEmail);

    /**
     * Find mapping by ticket ID
     */
    Optional<EmailToTicketMapping> findByTicketId(Long ticketId);
}

