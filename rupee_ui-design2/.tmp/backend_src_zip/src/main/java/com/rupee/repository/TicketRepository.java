package com.rupee.repository;

import com.rupee.dto.response.TicketResponse;
import com.rupee.entity.Ticket;
import com.rupee.enums.TicketEnums.Status;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public interface TicketRepository extends JpaRepository<Ticket, Long> {

    // ==========================================
    // 🚀 ULTRA-FAST DTO PROJECTIONS
    // ==========================================

    // FIX: Updated to match the new TicketResponse field order:
    //   1. Renamed firstRespondedAt → firstResponseAt in TicketResponse
    //   2. Added resolvedAt (t.resolvedAt)
    //   3. Added closedAt (t.closedAt)
    //   4. consultantName is NOT included here (requires a join; populated by service layer)
    //
    // The all-args constructor in TicketResponse must exactly match this order:
    // id, ticketNumber, userId, consultantId, category, description, attachmentUrl,
    // priority, status, slaRespondBy, slaResolveBy, isSlaBreached, firstResponseAt,
    // isEscalated, escalatedAt, escalationReason, feedbackRating, feedbackText,
    // createdAt, updatedAt, resolvedAt, closedAt
    // (consultantName left null by this query — enriched separately)
    String DTO_SELECT = "SELECT new com.rupee.dto.response.TicketResponse(" +
            "t.id, t.ticketNumber, t.userId, t.consultantId, t.category, t.description, " +
            "t.attachmentUrl, t.priority, t.status, t.slaRespondBy, t.slaResolveBy, " +
            "t.isSlaBreached, t.firstRespondedAt, t.isEscalated, t.escalatedAt, " +
            "t.escalationReason, t.feedbackRating, t.feedbackText, t.createdAt, t.updatedAt, " +
            "t.resolvedAt, t.closedAt, null) " +  // null = consultantName (populated by service)
            "FROM Ticket t ";

    @Query(DTO_SELECT)
    Page<TicketResponse> findAllDTO(Pageable pageable);

    @Query(DTO_SELECT + "WHERE t.id = :id")
    Optional<TicketResponse> findTicketByIdDTO(@Param("id") Long id);

    @Query(DTO_SELECT + "WHERE t.userId = :userId")
    Page<TicketResponse> findByUserIdDTO(@Param("userId") Long userId, Pageable pageable);

    @Query(DTO_SELECT + "WHERE t.consultantId = :consultantId")
    Page<TicketResponse> findByConsultantIdDTO(@Param("consultantId") Long consultantId, Pageable pageable);

    // ==========================================
    // 📊 ANALYTICS: UNPAGINATED TICKET QUERIES
    // ==========================================

    // FIX: These new methods return ALL tickets without pagination.
    // The existing GET /tickets endpoint only returns 10 rows by default,
    // causing the analytics module to compute metrics on an incomplete dataset.
    // The analytics controller uses these to return the full dataset.

    /**
     * Returns every ticket in the system, ordered by creation date.
     * Used by the Admin analytics module to compute platform-wide metrics.
     */
    @Query("SELECT t FROM Ticket t ORDER BY t.createdAt DESC")
    List<Ticket> findAllForAnalytics();

    /**
     * Returns all tickets assigned to a specific consultant.
     * Used by the Consultant analytics module for agent-scoped metrics.
     */
    @Query("SELECT t FROM Ticket t WHERE t.consultantId = :consultantId ORDER BY t.createdAt DESC")
    List<Ticket> findAllByConsultantIdForAnalytics(@Param("consultantId") Long consultantId);

    // ==========================================
    // 🛡️ EXISTING BUSINESS LOGIC (Unchanged)
    // ==========================================

    // == UPDATED ESCALATION & SLA FINDERS ==

    /**
     * Finds tickets that:
     * 1. Are NOT in a specific list of statuses (e.g., RESOLVED, CLOSED)
     * 2. Have NOT already been marked as breached (prevents double-processing)
     * 3. Have an SLA resolve time that is in the past
     */
    // ✅ FIXED: Changed to StatusNotIn to accept a List of statuses so it compiles with TicketService!
    List<Ticket> findByStatusNotInAndIsSlaBreachedFalseAndSlaResolveByBefore(List<Status> statuses, LocalDateTime date);

    // ✅ RESTORED: This is required for your Escalation Dashboard endpoint!
    List<Ticket> findByIsEscalatedTrue();

    // ✅ ADDED: Get specifically breached tickets for the Admin Dashboard
    List<Ticket> findByIsSlaBreachedTrue();

    // ✅ ADDED: Fetch recently resolved tickets for Average Resolution Time math
    List<Ticket> findByStatusInAndUpdatedAtAfter(List<Status> statuses, LocalDateTime date);

    // == 3. DASHBOARD GRAPH PROJECTIONS & QUERIES ==

    /**
     * Projection for graph data.
     * label = X-axis (Category or Consultant ID)
     * count = Y-axis (Total tickets)
     */
    interface TicketGraphData {
        String getLabel();
        Long getCount();
    }

    // Daily/Weekly summary grouped by Category
    @Query("SELECT t.category AS label, COUNT(t) AS count " +
            "FROM Ticket t WHERE t.createdAt >= :startDate " +
            "GROUP BY t.category")
    List<TicketGraphData> getTicketSummaryByCategory(@Param("startDate") LocalDateTime startDate);

    // Daily/Weekly summary grouped by Consultant
    @Query("SELECT CAST(t.consultantId AS string) AS label, COUNT(t) AS count " +
            "FROM Ticket t WHERE t.createdAt >= :startDate AND t.consultantId IS NOT NULL " +
            "GROUP BY t.consultantId")
    List<TicketGraphData> getTicketSummaryByConsultant(@Param("startDate") LocalDateTime startDate);

    // ==========================================
    // ✅ FETCH EXISTING CATEGORIES FOR FRONTEND
    // ==========================================
    @Query("SELECT DISTINCT t.category FROM Ticket t WHERE t.category IS NOT NULL ORDER BY t.category ASC")
    List<String> findDistinctCategories();

    // ==========================================
    // 📈 ANALYTICS: TICKET VOLUME
    // ==========================================

    long countByCreatedAtGreaterThanEqual(LocalDateTime date);

    long countByStatusInAndUpdatedAtGreaterThanEqual(List<Status> statuses, LocalDateTime date);

    long countByStatusNotIn(List<Status> statuses);

    @Query("SELECT CAST(t.createdAt AS date) AS label, COUNT(t) AS count " +
            "FROM Ticket t WHERE t.createdAt >= :startDate GROUP BY CAST(t.createdAt AS date)")
    List<TicketGraphData> getCreatedTicketsPerDay(@Param("startDate") LocalDateTime startDate);

    @Query("SELECT CAST(t.updatedAt AS date) AS label, COUNT(t) AS count " +
            "FROM Ticket t WHERE t.updatedAt >= :startDate AND t.status IN :statuses " +
            "GROUP BY CAST(t.updatedAt AS date)")
    List<TicketGraphData> getResolvedTicketsPerDay(@Param("startDate") LocalDateTime startDate, @Param("statuses") List<Status> statuses);

    // ==========================================
    // 📊 AGENT PERFORMANCE PROJECTIONS
    // ==========================================
    interface AgentPerformanceData {
        Long getConsultantId();
        Long getTotalAssigned();
        Long getTotalResolved();
    }
    @Query("SELECT t.consultantId AS consultantId, COUNT(t) AS totalAssigned, " +
            "SUM(CASE WHEN t.status IN ('RESOLVED', 'CLOSED') THEN 1 ELSE 0 END) AS totalResolved " +
            "FROM Ticket t WHERE t.createdAt >= :startDate AND t.consultantId IS NOT NULL GROUP BY t.consultantId")
    List<AgentPerformanceData> getAgentPerformance(@Param("startDate") LocalDateTime startDate);

    // ==========================================
    // 📊 SLA BREACH PROJECTIONS
    // ==========================================
    interface SlaCategoryData {
        String getCategory();
        Long getTotal();
        Long getBreached();
    }
    @Query("SELECT t.category AS category, COUNT(t) AS total, " +
            "SUM(CASE WHEN t.isSlaBreached = true THEN 1 ELSE 0 END) AS breached " +
            "FROM Ticket t WHERE t.createdAt >= :startDate GROUP BY t.category")
    List<SlaCategoryData> getSlaBreachByCategory(@Param("startDate") LocalDateTime startDate);

    // ==========================================
    // 📊 ADVANCED REPORTS PROJECTIONS
    // ==========================================
    @Query("SELECT CAST(t.status AS string) AS label, COUNT(t) AS count " +
            "FROM Ticket t WHERE t.createdAt >= :startDate GROUP BY t.status")
    List<TicketGraphData> getTicketSummaryByStatus(@Param("startDate") LocalDateTime startDate);

    @Query("SELECT CAST(t.priority AS string) AS label, COUNT(t) AS count " +
            "FROM Ticket t WHERE t.createdAt >= :startDate GROUP BY t.priority")
    List<TicketGraphData> getTicketSummaryByPriority(@Param("startDate") LocalDateTime startDate);

    // ==========================================
    // 📊 SUPPORT CONFIG SUMMARY
    // ==========================================
    long countByIsEscalatedTrueAndCreatedAtGreaterThanEqual(LocalDateTime startDate);

    // --- SUMMARY CARD QUERIES ---
    long countByStatusIn(List<Status> statuses);

    long countByIsSlaBreachedTrue();

    long countByIsEscalatedTrue();

    long countByStatus(Status status);

    long countByStatusAndUpdatedAtGreaterThanEqual(Status status, LocalDateTime date);

    // ==========================================
    // 👤 USER ANALYTICS QUERIES
    // ==========================================
    long countByUserIdAndStatusNotIn(Long userId, List<Status> statuses);

    // --- CONSULTANT ANALYTICS ---
    long countByConsultantIdAndStatus(Long consultantId, Status status);

    // To get all "Open" or "In Progress" tickets
    long countByConsultantIdAndStatusNotIn(Long consultantId, List<Status> statuses);

    // --- HELPDESK ANALYTICS QUERIES ---

    // Admin: Tickets by Status
    @Query("SELECT new map(CAST(t.status AS string) as status, COUNT(t.id) as count) FROM Ticket t GROUP BY t.status")
    List<Map<String, Object>> getPlatformTicketsByStatus();

    // Consultant: Tickets by Status
    @Query("SELECT new map(CAST(t.status AS string) as status, COUNT(t.id) as count) FROM Ticket t WHERE t.consultantId = :consultantId GROUP BY t.status")
    List<Map<String, Object>> getConsultantTicketsByStatus(@Param("consultantId") Long consultantId);

    // Fetch recent tickets for the User Dashboard
    List<Ticket> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);

    // Fetch recent tickets for the Admin Dashboard
    List<Ticket> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
