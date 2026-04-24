package com.rupee.repository;

import com.rupee.entity.TicketNote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TicketNoteRepository extends JpaRepository<TicketNote, Long> {
    // Fetches notes date-wise (oldest to newest)
    List<TicketNote> findByTicketIdOrderByCreatedAtAsc(Long ticketId);
}