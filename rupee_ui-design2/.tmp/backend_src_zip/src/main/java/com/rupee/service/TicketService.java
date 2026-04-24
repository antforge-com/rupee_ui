package com.rupee.service;

import com.rupee.dto.request.TicketCommentRequest;
import com.rupee.dto.request.TicketEscalationRequest;
import com.rupee.dto.request.TicketNoteRequest;
import com.rupee.dto.request.TicketRequest;
import com.rupee.dto.response.TicketCommentResponse;
import com.rupee.dto.response.TicketNoteResponse;
import com.rupee.dto.response.TicketResponse;
import com.rupee.entity.SystemConfig;
import com.rupee.entity.Ticket;
import com.rupee.entity.TicketComment;
import com.rupee.entity.TicketNote;
import com.rupee.enums.TicketEnums.Priority;
import com.rupee.enums.TicketEnums.Status;
import com.rupee.repository.SystemConfigRepository;
import com.rupee.repository.TicketCommentRepository;
import com.rupee.repository.TicketNoteRepository;
import com.rupee.repository.TicketRepository;
import com.rupee.repository.TicketRepository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class TicketService {

    private final TicketRepository ticketRepository;
    private final TicketCommentRepository commentRepository;
    private final TicketNoteRepository noteRepository;
    private final NotificationService notificationService;

    // Calendar-Aware SLA Math & Auto-Responder Injections
    private final SlaCalculationService slaCalculationService;
    private final SystemConfigRepository configRepository;

    // ADDED: Required to enforce the Admin-only priority downgrade rule
    private final SecurityService securityService;

    private final S3StorageService s3StorageService; // ✅ 1. ADD THIS

    // The kill switch for the SLA scheduled job
    @Value("${ticket.sla.check.enabled:true}")
    private boolean isSlaCheckEnabled;

    private static final String TICKET_NOT_FOUND = "Ticket not found with ID: ";

    // ✅ ADD THESE CONSTANTS
    private static final String KEY_CREATED = "created";
    private static final String KEY_RESOLVED = "resolved";
    private static final String KEY_TOTAL_RESOLVED = "totalResolved";
    private static final String KEY_LABEL = "label";
    private static final String KEY_COUNT = "count";
    private static final String KEY_AVG_RESOLUTION = "averageResolution";
    private static final String KEY_AVG_RESPONSE = "averageResponse";
    private static final String VAL_UNASSIGNED = "Unassigned";

    // --- CORE TICKET LOGIC ---

    // ✅ NEW: Fetch all uniquely used categories for the frontend dropdown
    @Transactional(readOnly = true)
    public List<String> getUniqueCategories() {
        return ticketRepository.findDistinctCategories();
    }

    @Transactional
    public TicketResponse createTicket(TicketRequest request, MultipartFile file) {
        Ticket ticket = new Ticket();
        ticket.setUserId(request.getUserId());
        ticket.setConsultantId(request.getConsultantId());
        ticket.setCategory(formatCategoryName(request.getCategory()));
        ticket.setDescription(request.getDescription());

        // ✅ 3. REPLACE THIS ENTIRE IF-BLOCK:
        if (file != null && !file.isEmpty()) {
            // S3 handles all the paths, names, and IOExceptions now!
            ticket.setAttachmentUrl(s3StorageService.uploadFile(file, "tickets"));
        } else {
            ticket.setAttachmentUrl(request.getAttachmentUrl());
        }

        ticket.setPriority(request.getPriority() != null ? request.getPriority() : Priority.MEDIUM);
        ticket.setStatus(Status.NEW);

        LocalDateTime now = LocalDateTime.now();

        // Business Hours SLA Math
        // FIXED: Dynamic Business Hours SLA Math based on Priority
        int resolveHours = getSlaResolveHours(ticket.getPriority());
        ticket.setSlaRespondBy(slaCalculationService.calculateSlaDeadline(now, 2));
        ticket.setSlaResolveBy(slaCalculationService.calculateSlaDeadline(now, resolveHours));

        // ==========================================
        // ✅ NEW LOGIC: FIX FOR 409 CONFLICT
        // ==========================================

        // 1. Set a temporary unique ID so the initial save doesn't fail the unique constraint
        ticket.setTicketNumber("TEMP-" + UUID.randomUUID().toString().substring(0, 8));

        // 2. Save the ticket FIRST to let MySQL generate the true, collision-proof ID
        Ticket savedTicket = ticketRepository.save(ticket);

        // 3. Generate the real Ticket Number using the guaranteed unique Database ID
        int currentMonth = now.getMonthValue();
        int currentYear = now.getYear();
        String customTicketId = String.format("%02d/%02d/%d", currentMonth, currentYear % 100, savedTicket.getId());

        // 4. Overwrite the TEMP id and save it again (Hibernate performs a fast UPDATE here)
        savedTicket.setTicketNumber(customTicketId);
        ticketRepository.save(savedTicket);

        // ==========================================

        // Auto-Responder Logic
        configRepository.findByKey("AUTO_RESPONDER_ENABLED")
                .filter(config -> "true".equalsIgnoreCase(config.getValue()))
                .ifPresent(config -> {
                    String msg = configRepository.findByKey("AUTO_RESPONDER_MESSAGE")
                            .map(SystemConfig::getValue)
                            .orElse("Thank you for reaching out! A consultant will review your ticket shortly.");

                    TicketComment autoReply = new TicketComment();
                    autoReply.setTicketId(savedTicket.getId());
                    autoReply.setSenderId(0L); // System user ID for auto-replies
                    autoReply.setConsultantReply(true);
                    autoReply.setMessage("🤖 Auto-Response: " + msg);

                    commentRepository.save(autoReply);

                    savedTicket.setFirstRespondedAt(now);
                    ticketRepository.save(savedTicket);
                });

        // Notification Triggers
        if (savedTicket.getConsultantId() != null) {
            notificationService.notifyNewAssignment(savedTicket.getConsultantId(), savedTicket.getId(), savedTicket.getTicketNumber());
        }

        // Trigger the "Ticket Created" email receipt to the user who opened it!
        notificationService.notifyTicketCreated(
                savedTicket.getUserId(),
                savedTicket.getId(),
                savedTicket.getTicketNumber(),
                savedTicket.getCategory(),
                savedTicket.getConsultantId() // ✅ Pass the consultant ID here
        );

        return mapToTicketResponse(savedTicket);
    }

    // Returns paginated response using ULTRA-FAST DTO Projection
    @Transactional(readOnly = true)
    public Page<TicketResponse> getAllTickets(Pageable pageable) {
        return ticketRepository.findAllDTO(pageable); // ✅ No mapping needed!
    }

    // Fast Single Fetch using DTO Projection
    @Transactional(readOnly = true)
    public TicketResponse getTicketById(Long id) {
        return ticketRepository.findTicketByIdDTO(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, TICKET_NOT_FOUND + id));
    }

    // Returns paginated response using ULTRA-FAST DTO Projection
    @Transactional(readOnly = true)
    public Page<TicketResponse> getTicketsByUser(Long userId, Pageable pageable) {
        return ticketRepository.findByUserIdDTO(userId, pageable); // ✅ No mapping needed!
    }

    // Returns paginated response using ULTRA-FAST DTO Projection
    @Transactional(readOnly = true)
    public Page<TicketResponse> getTicketsByConsultant(Long consultantId, Pageable pageable) {
        return ticketRepository.findByConsultantIdDTO(consultantId, pageable); // ✅ No mapping needed!
    }

    @Transactional
    public TicketResponse updateTicketStatus(Long id, Status newStatus) {
        Ticket ticket = ticketRepository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, TICKET_NOT_FOUND + id));
        ticket.setStatus(newStatus);
        // FIX: Stamp resolvedAt / closedAt so analytics can compute accurate
        // resolution times. Previously these were never set, forcing the
        // analytics module to fall back to updatedAt (which changes on every
        // comment or priority update — making resolution-time metrics wrong).
        LocalDateTime now = LocalDateTime.now();
        if (newStatus == Status.RESOLVED && ticket.getResolvedAt() == null) {
            ticket.setResolvedAt(now);
        }
        if (newStatus == Status.CLOSED && ticket.getClosedAt() == null) {
            ticket.setClosedAt(now);
        }
        Ticket updatedTicket = ticketRepository.save(ticket);

        notificationService.notifyTicketUpdate(updatedTicket.getUserId(), updatedTicket.getId(), updatedTicket.getTicketNumber(), newStatus.name());

        return mapToTicketResponse(updatedTicket);
    }

    // Endpoint logic to handle priority updates with Admin downgrade protection
    @Transactional
    public TicketResponse updateTicketPriority(Long id, Priority newPriority) {
        Ticket ticket = ticketRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, TICKET_NOT_FOUND + id));

        // SECURITY RULE: Priority Downgrade check
        // Enums compare by ordinal value (LOW=0, MEDIUM=1, HIGH=2, CRITICAL=3)
        // If the new priority is less than the current, it's a downgrade!
        if (newPriority.ordinal() < ticket.getPriority().ordinal()
                && !"ADMIN".equals(securityService.getCurrentUser().getRole().name())) {

            log.warn("SECURITY ALERT: User {} attempted to downgrade ticket {} priority illegally.",
                    securityService.getCurrentUser().getId(), id);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access Denied: Only Admins can lower a ticket's priority.");
        }

        ticket.setPriority(newPriority);

        // FIXED: Recalculate the SLA deadline when priority is upgraded
        int newResolveHours = getSlaResolveHours(newPriority);
        LocalDateTime startTime = ticket.getCreatedAt() != null ? ticket.getCreatedAt() : LocalDateTime.now();
        ticket.setSlaResolveBy(slaCalculationService.calculateSlaDeadline(startTime, newResolveHours));

        Ticket savedTicket = ticketRepository.save(ticket);

        // Notify user of priority change
        notificationService.notifyTicketUpdate(savedTicket.getUserId(), savedTicket.getId(), savedTicket.getTicketNumber(), "Priority changed to " + newPriority.name());

        return mapToTicketResponse(savedTicket);
    }

    @Transactional
    public TicketResponse assignConsultant(Long ticketId, Long consultantId) {
        Ticket ticket = ticketRepository.findById(ticketId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, TICKET_NOT_FOUND + ticketId));
        Long oldConsultantId = ticket.getConsultantId();

        ticket.setConsultantId(consultantId);
        if (ticket.getStatus() == Status.NEW) ticket.setStatus(Status.OPEN);

        Ticket savedTicket = ticketRepository.save(ticket);

        if (consultantId != null && !consultantId.equals(oldConsultantId)) {
            notificationService.notifyNewAssignment(consultantId, ticketId, ticket.getTicketNumber());
        }

        return mapToTicketResponse(savedTicket);
    }

    @Transactional
    public TicketResponse submitFeedback(Long id, Integer rating, String text) {
        Ticket ticket = ticketRepository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, TICKET_NOT_FOUND + id));
        ticket.setFeedbackRating(rating);
        ticket.setFeedbackText(text);

        if (ticket.getStatus() == Status.RESOLVED) {
            ticket.setStatus(Status.CLOSED);
            // FIX: Stamp closedAt so analytics knows the exact close time
            if (ticket.getClosedAt() == null) {
                ticket.setClosedAt(LocalDateTime.now());
            }
            notificationService.notifyTicketUpdate(ticket.getUserId(), ticket.getId(), ticket.getTicketNumber(), Status.CLOSED.name());
        }

        Ticket savedTicket = ticketRepository.save(ticket);

        // Critical log for poor customer experience
        if (rating != null && rating < 3) {
            log.warn("POOR SERVICE ALERT: Ticket ID {} received a low rating of {}. Feedback: '{}'", id, rating, text);
        }

        return mapToTicketResponse(savedTicket);
    }

    @Transactional
    public void deleteTicket(Long id) {
        Ticket ticket = ticketRepository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, TICKET_NOT_FOUND + id));

        // ✅ ADDED: Delete the file from S3 so it doesn't take up space forever
        if (ticket.getAttachmentUrl() != null) {
            s3StorageService.deleteFile(ticket.getAttachmentUrl());
        }

        ticketRepository.delete(ticket);
    }

    // --- ESCALATION & SLA LOGIC ---

    @Transactional
    public TicketResponse escalateTicket(Long ticketId, TicketEscalationRequest request) {
        Ticket ticket = ticketRepository.findById(ticketId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, TICKET_NOT_FOUND + ticketId));

        if (ticket.getStatus() == Status.RESOLVED || ticket.getStatus() == Status.CLOSED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot escalate a closed or resolved ticket.");
        }

        ticket.setEscalated(true);
        ticket.setEscalatedAt(LocalDateTime.now());
        ticket.setEscalationReason(request.getReason());

        Ticket savedTicket = ticketRepository.save(ticket);

        // Critical log for manual escalation
        log.warn("MANUAL ESCALATION: Ticket {} has been escalated. Reason: {}", ticketId, request.getReason());

        // ✅ Grab the role of whoever clicked the Escalate button
        String currentUserRole = securityService.getCurrentUser().getRole().name();

        // ✅ Call the new role-aware notification method
        notificationService.notifyManualEscalation(
                ticket.getUserId(), ticket.getConsultantId(), ticketId, ticket.getTicketNumber(), request.getReason(), currentUserRole);

        return mapToTicketResponse(savedTicket);
    }

    public List<TicketResponse> getEscalatedTickets() {
        return ticketRepository.findByIsEscalatedTrue().stream()
                .map(this::mapToTicketResponse)
                .toList();
    }

    // Configurable schedule.
    @Scheduled(fixedRateString = "${ticket.sla.check.interval:300000}")
    @Transactional
    public void trackAndEnforceSLA() {
        // Gracefully exit immediately if disabled in application.properties
        if (!isSlaCheckEnabled) {
            return;
        }

        List<Status> closedStatuses = Arrays.asList(Status.RESOLVED, Status.CLOSED);
        List<Ticket> overdueTickets = ticketRepository.findByStatusNotInAndIsSlaBreachedFalseAndSlaResolveByBefore(closedStatuses, LocalDateTime.now());

        if (overdueTickets.isEmpty()) return;

        for (Ticket ticket : overdueTickets) {
            ticket.setSlaBreached(true);
            ticket.setEscalated(true);
            ticket.setEscalatedAt(LocalDateTime.now());
            ticket.setEscalationReason("SYSTEM AUTO-ESCALATION: SLA Resolve Time Exceeded.");

            // Critical error log for SLA compliance failures
            log.error("SLA BREACH DETECTED: Ticket ID {} auto-escalated.", ticket.getId());

            notificationService.notifyEscalation(ticket.getUserId(), ticket.getId(), ticket.getTicketNumber(), ticket.getEscalationReason());
        }
        ticketRepository.saveAll(overdueTickets);
    }

    // --- COMMENTS & NOTES LOGIC ---

    @Transactional
    public TicketCommentResponse addComment(TicketCommentRequest request) {
        Ticket ticket = ticketRepository.findById(request.getTicketId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, TICKET_NOT_FOUND + request.getTicketId()));

        TicketComment comment = new TicketComment();
        comment.setTicketId(request.getTicketId());
        comment.setSenderId(request.getSenderId());
        comment.setConsultantReply(request.getIsConsultantReply());
        comment.setMessage(request.getMessage());

        // Complete the notification loop for comments
        if (Boolean.TRUE.equals(request.getIsConsultantReply())) {
            if (ticket.getFirstRespondedAt() == null) {
                ticket.setFirstRespondedAt(LocalDateTime.now());
            }
            if (ticket.getStatus() == Status.NEW) {
                ticket.setStatus(Status.OPEN);
                notificationService.notifyTicketUpdate(ticket.getUserId(), ticket.getId(), ticket.getTicketNumber(), Status.OPEN.name());
            } else {
                // Notify User that consultant sent a message (if status didn't change)
                notificationService.notifyNewComment(ticket.getUserId(), ticket.getId(), ticket.getTicketNumber());
            }
            ticketRepository.save(ticket);
        } else {
            // Notify Consultant that the user replied
            if (ticket.getConsultantId() != null) {
                notificationService.notifyNewComment(ticket.getConsultantId(), ticket.getId(), ticket.getTicketNumber());
            }
        }

        TicketComment savedComment = commentRepository.save(comment);
        return mapToCommentResponse(savedComment);
    }

    public List<TicketCommentResponse> getTicketThread(Long ticketId) {
        return commentRepository.findByTicketIdOrderByCreatedAtAsc(ticketId).stream().map(this::mapToCommentResponse).toList();
    }

    @Transactional
    public TicketNoteResponse addInternalNote(Long ticketId, TicketNoteRequest request) {
        if (!ticketRepository.existsById(ticketId)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, TICKET_NOT_FOUND + ticketId);

        TicketNote note = new TicketNote();
        note.setTicketId(ticketId);
        note.setAuthorId(request.getAuthorId());
        note.setNoteText(request.getNoteText());

        TicketNote savedNote = noteRepository.save(note);
        return new TicketNoteResponse(savedNote.getId(), savedNote.getTicketId(), savedNote.getAuthorId(), savedNote.getNoteText(), savedNote.getCreatedAt());
    }

    public List<TicketNoteResponse> getInternalNotes(Long ticketId) {
        if (!ticketRepository.existsById(ticketId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, TICKET_NOT_FOUND + ticketId);
        }
        return noteRepository.findByTicketIdOrderByCreatedAtAsc(ticketId).stream()
                .map(note -> new TicketNoteResponse(note.getId(), note.getTicketId(), note.getAuthorId(), note.getNoteText(), note.getCreatedAt()))
                .toList();
    }

    // --- DASHBOARD ANALYTICS ---

    public Map<String, List<TicketGraphData>> getGraphSummaries(String period) {
        LocalDateTime startDate = period.equalsIgnoreCase("DAILY") ? LocalDateTime.now().minusDays(1) : LocalDateTime.now().minusWeeks(1);
        List<TicketGraphData> byCategory = ticketRepository.getTicketSummaryByCategory(startDate);
        List<TicketGraphData> byConsultant = ticketRepository.getTicketSummaryByConsultant(startDate);

        return Map.of(
                "byCategory", byCategory,
                "byConsultant", byConsultant
        );
    }

    // --- ADMIN DASHBOARD FEATURES ---

    // ==========================================
    // ✅ NEW: Admin Dashboard Summary (Service Layer)
    // ==========================================
    @Transactional(readOnly = true)
    public Map<String, Object> getTicketSummary() {
        LocalDateTime startOfToday = LocalDate.now().atStartOfDay();

        long total = ticketRepository.count(); // Fast native SQL count
        long openActive = ticketRepository.countByStatusIn(Arrays.asList(Status.NEW, Status.OPEN, Status.PENDING));
        long overdue = ticketRepository.countByIsSlaBreachedTrue();
        long escalated = ticketRepository.countByIsEscalatedTrue();
        long resolved = ticketRepository.countByStatus(Status.RESOLVED);
        long resolvedToday = ticketRepository.countByStatusAndUpdatedAtGreaterThanEqual(Status.RESOLVED, startOfToday);
        long closed = ticketRepository.countByStatus(Status.CLOSED);

        return Map.of(
                "total", total,
                "openActive", openActive,
                "overdue", overdue,
                "escalated", escalated,
                KEY_RESOLVED, resolved,
                "resolvedToday", resolvedToday,
                "closed", closed
        );
    }

    public List<TicketResponse> getSlaBreachedTickets() {
        return ticketRepository.findByIsSlaBreachedTrue().stream()
                .map(this::mapToTicketResponse)
                .toList();
    }

    // Safely calculates both average resolution time and average response time in Java
    public Map<String, Object> getResolutionAnalytics(String period) {
        LocalDateTime startDate = period.equalsIgnoreCase("DAILY")
                ? LocalDateTime.now().minusDays(1)
                : LocalDateTime.now().minusWeeks(1);

        List<Status> resolvedStatuses = Arrays.asList(Status.RESOLVED, Status.CLOSED);
        List<Ticket> recentResolutions = ticketRepository.findByStatusInAndUpdatedAtAfter(resolvedStatuses, startDate);

        if (recentResolutions.isEmpty()) {
            return Map.of("averageResolutionHours", 0, "averageResponseHours", 0, KEY_TOTAL_RESOLVED, 0);
        }

        long totalResolutionHours = 0;
        long totalResponseHours = 0;
        int ticketsWithResponses = 0;

        for (Ticket t : recentResolutions) {
            // 1. Math for Resolution Time
            totalResolutionHours += Duration.between(t.getCreatedAt(), t.getUpdatedAt()).toHours();

            // 2. Math for Response Time
            if (t.getFirstRespondedAt() != null) {
                totalResponseHours += Duration.between(t.getCreatedAt(), t.getFirstRespondedAt()).toHours();
                ticketsWithResponses++;
            }
        }

        double avgResolution = (double) totalResolutionHours / recentResolutions.size();
        double avgResponse = ticketsWithResponses > 0 ? (double) totalResponseHours / ticketsWithResponses : 0;

        return Map.of(
                "averageResolutionHours", Math.round(avgResolution * 10.0) / 10.0,
                "averageResponseHours", Math.round(avgResponse * 10.0) / 10.0,
                KEY_TOTAL_RESOLVED, recentResolutions.size()
        );
    }

    // ==========================================
    // 📊 DASHBOARD: TICKET VOLUME TAB
    // ==========================================
    public Map<String, Object> getTicketVolumeAnalytics(int days) {
        LocalDateTime startDate = LocalDateTime.now().minusDays(days);
        List<Status> closedStatuses = Arrays.asList(Status.RESOLVED, Status.CLOSED);

        // 1. Top Card Metrics
        long totalCreated = ticketRepository.countByCreatedAtGreaterThanEqual(startDate);
        long totalResolved = ticketRepository.countByStatusInAndUpdatedAtGreaterThanEqual(closedStatuses, startDate);
        long totalOpen = ticketRepository.countByStatusNotIn(closedStatuses); // System-wide active tickets

        double resolutionRate = totalCreated > 0 ? ((double) totalResolved / totalCreated) * 100.0 : 0.0;
        resolutionRate = Math.round(resolutionRate * 10.0) / 10.0;

        // 2. Fetch Raw Database Groupings
        List<TicketGraphData> createdDaily = ticketRepository.getCreatedTicketsPerDay(startDate);
        List<TicketGraphData> resolvedDaily = ticketRepository.getResolvedTicketsPerDay(startDate, closedStatuses);

        // 3. Initialize a clean timeline array for the frontend chart (e.g., "13 Mar")
        Map<String, Map<String, Long>> dailyMap = new LinkedHashMap<>();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd MMM");

        for (int i = days - 1; i >= 0; i--) {
            String dateStr = LocalDateTime.now().minusDays(i).format(formatter);
            Map<String, Long> dayData = new HashMap<>();
            dayData.put(KEY_CREATED, 0L);
            dayData.put(KEY_RESOLVED, 0L);
            dailyMap.put(dateStr, dayData);
        }

        // 4. Populate Created Data
        for (TicketGraphData data : createdDaily) {
            if (data.getLabel() != null) {
                String formattedDate = LocalDate.parse(data.getLabel()).format(formatter);
                if (dailyMap.containsKey(formattedDate)) {
                    dailyMap.get(formattedDate).put(KEY_CREATED, data.getCount());
                }
            }
        }

        // 5. Populate Resolved Data
        for (TicketGraphData data : resolvedDaily) {
            if (data.getLabel() != null) {
                String formattedDate = LocalDate.parse(data.getLabel()).format(formatter);
                if (dailyMap.containsKey(formattedDate)) {
                    dailyMap.get(formattedDate).put(KEY_RESOLVED, data.getCount());
                }
            }
        }

        // 6. Convert to Frontend-Friendly Array
        List<Map<String, Object>> chartData = new ArrayList<>();
        for (Map.Entry<String, Map<String, Long>> entry : dailyMap.entrySet()) {
            chartData.add(Map.of(
                    "date", entry.getKey(),
                    KEY_CREATED, entry.getValue().get(KEY_CREATED),
                    KEY_RESOLVED, entry.getValue().get(KEY_RESOLVED)
            ));
        }

        // Return perfectly formatted JSON
        return Map.of(
                "totalCreated", totalCreated,
                KEY_TOTAL_RESOLVED, totalResolved,
                "totalOpen", totalOpen,
                "resolutionRate", resolutionRate,
                "chartData", chartData
        );
    }

    // ==========================================
    // 📊 DASHBOARD: AGENT PERFORMANCE (TAB 2)
    // ==========================================
    public Map<String, Object> getAgentPerformanceAnalytics(int days) {
        LocalDateTime startDate = LocalDateTime.now().minusDays(days);
        List<AgentPerformanceData> rawData = ticketRepository.getAgentPerformance(startDate);

        long totalAgents = rawData.size();
        long totalAssigned = rawData.stream().mapToLong(AgentPerformanceData::getTotalAssigned).sum();
        long totalResolved = rawData.stream().mapToLong(AgentPerformanceData::getTotalResolved).sum();
        double avgRate = totalAssigned > 0 ? ((double) totalResolved / totalAssigned) * 100 : 0;

        List<Map<String, Object>> tableData = rawData.stream().map(d -> {
            Map<String, Object> map = new HashMap<>();
            map.put("consultantId", d.getConsultantId());
            map.put("assigned", d.getTotalAssigned());
            map.put(KEY_RESOLVED, d.getTotalResolved());
            map.put("rate", d.getTotalAssigned() > 0 ? Math.round(((double) d.getTotalResolved() / d.getTotalAssigned()) * 100) : 0);
            return map;
        }).toList();

        return Map.of("totalAgents", totalAgents, "totalAssigned", totalAssigned,
                "avgResolutionRate", Math.round(avgRate), "tableData", tableData);
    }

    // ==========================================
    // 📊 DASHBOARD: SLA BREACH (TAB 5)
    // ==========================================
    public Map<String, Object> getSlaAnalytics(int days) {
        LocalDateTime startDate = LocalDateTime.now().minusDays(days);
        List<SlaCategoryData> categoryData = ticketRepository.getSlaBreachByCategory(startDate);

        long totalTracked = categoryData.stream().mapToLong(SlaCategoryData::getTotal).sum();
        long totalBreached = categoryData.stream().mapToLong(SlaCategoryData::getBreached).sum();
        long compliant = totalTracked - totalBreached;

        List<Map<String, Object>> tableData = categoryData.stream().map(d -> {
            Map<String, Object> map = new HashMap<>();
            map.put("category", d.getCategory());
            map.put("total", d.getTotal());
            map.put("breached", d.getBreached());
            return map;
        }).toList(); // ✅ Java 21 .toList() works perfectly here!

        return Map.of("totalTracked", totalTracked, "totalBreached", totalBreached,
                "compliant", compliant, "tableData", tableData);
    }

    // ==========================================
    // 📊 DASHBOARD: RESPONSE TIMES (TAB 4)
    // ==========================================
    public Map<String, Object> getResponseTimeAnalytics(int days) {
        LocalDateTime startDate = LocalDateTime.now().minusDays(days);
        List<Status> resolvedStatuses = Arrays.asList(Status.RESOLVED, Status.CLOSED);
        List<Ticket> recentResolutions = ticketRepository.findByStatusInAndUpdatedAtAfter(resolvedStatuses, startDate);

        if (recentResolutions.isEmpty()) {
            return Map.of(KEY_AVG_RESOLUTION, 0, "medianResolution", 0, KEY_AVG_RESPONSE, 0, "priorityChart", new ArrayList<>());
        }

        List<Long> resolutionTimes = new ArrayList<>();
        List<Long> responseTimes = new ArrayList<>();
        Map<Priority, List<Long>> priorityMap = new EnumMap<>(Priority.class);

        // 1. Extract raw hours from tickets
        for (Ticket t : recentResolutions) {
            long resHours = Duration.between(t.getCreatedAt(), t.getUpdatedAt()).toHours();
            resolutionTimes.add(resHours);

            priorityMap.computeIfAbsent(t.getPriority(), k -> new ArrayList<>()).add(resHours);

            if (t.getFirstRespondedAt() != null) {
                responseTimes.add(Duration.between(t.getCreatedAt(), t.getFirstRespondedAt()).toHours());
            }
        }

        // 2. Calculate Averages
        double avgResolution = resolutionTimes.stream().mapToLong(val -> val).average().orElse(0.0);
        double avgResponse = responseTimes.stream().mapToLong(val -> val).average().orElse(0.0);

        // 3. Calculate Median
        Collections.sort(resolutionTimes);
        double medianResolution = 0;
        if (!resolutionTimes.isEmpty()) {
            int middle = resolutionTimes.size() / 2;
            medianResolution = resolutionTimes.size() % 2 == 1
                    ? resolutionTimes.get(middle)
                    : (resolutionTimes.get(middle - 1) + resolutionTimes.get(middle)) / 2.0;
        }

        // 4. Calculate Priority Breakdown Chart (Using safe HashMaps)
        List<Map<String, Object>> priorityChart = new ArrayList<>();
        for (Map.Entry<Priority, List<Long>> entry : priorityMap.entrySet()) {
            double pAvg = entry.getValue().stream().mapToLong(v -> v).average().orElse(0.0);
            Map<String, Object> map = new HashMap<>();
            map.put("priority", entry.getKey().name());
            map.put("avgHours", Math.round(pAvg * 10.0) / 10.0);
            priorityChart.add(map);
        }

        Map<String, Object> result = new HashMap<>();
        result.put(KEY_AVG_RESOLUTION, Math.round(avgResolution * 10.0) / 10.0);
        result.put("medianResolution", Math.round(medianResolution * 10.0) / 10.0);
        result.put(KEY_AVG_RESPONSE, Math.round(avgResponse * 10.0) / 10.0);
        result.put("priorityChart", priorityChart);

        return result;
    }

    // ==========================================
    // 📊 DASHBOARD: ADVANCED REPORTS (SIDEBAR)
    // ==========================================
    public Map<String, Object> getAdvancedReportsAnalytics(int days, String groupBy) {
        LocalDateTime startDate = LocalDateTime.now().minusDays(days);
        List<TicketGraphData> graphData;

        // 1. Dynamic database routing based on frontend dropdown selection
        graphData = switch (groupBy.toUpperCase()) {
            case "CONSULTANT" -> ticketRepository.getTicketSummaryByConsultant(startDate);
            case "STATUS" -> ticketRepository.getTicketSummaryByStatus(startDate);
            case "PRIORITY" -> ticketRepository.getTicketSummaryByPriority(startDate);
            default -> ticketRepository.getTicketSummaryByCategory(startDate); // ✅ Covers CATEGORY and default
        };

        // 2. Calculate Top Cards
        long totalTickets = graphData.stream().mapToLong(TicketGraphData::getCount).sum();
        String topLabel = "N/A";
        long topCount = 0;

        for (TicketGraphData d : graphData) {
            if (d.getCount() > topCount) {
                topCount = d.getCount();
                topLabel = d.getLabel() != null ? d.getLabel() : VAL_UNASSIGNED;
            }
        }

        // 3. Format Chart Data (Using safe HashMaps)
        List<Map<String, Object>> chartData = graphData.stream().map(d -> {
            Map<String, Object> map = new HashMap<>();
            map.put(KEY_LABEL, d.getLabel() != null ? d.getLabel() : VAL_UNASSIGNED);
            map.put(KEY_COUNT, d.getCount());
            return map;
        }).toList();

        Map<String, Object> response = new HashMap<>();
        response.put("totalTickets", totalTickets);
        response.put("topLabel", topLabel);
        response.put("topCount", topCount);
        response.put("chartData", chartData);

        return response;
    }

    // ==========================================
    // 📊 DASHBOARD: SUPPORT CONFIG SUMMARY
    // ==========================================
    public Map<String, Object> getSupportConfigReports(int days) {
        LocalDateTime startDate = LocalDateTime.now().minusDays(days);
        List<Status> closedStatuses = Arrays.asList(Status.RESOLVED, Status.CLOSED);

        // 1. Top Row Metrics
        long totalTickets = ticketRepository.countByCreatedAtGreaterThanEqual(startDate);
        long resolved = ticketRepository.countByStatusInAndUpdatedAtGreaterThanEqual(closedStatuses, startDate);
        double resolveRate = totalTickets > 0 ? ((double) resolved / totalTickets) * 100.0 : 0.0;

        long escalated = ticketRepository.countByIsEscalatedTrueAndCreatedAtGreaterThanEqual(startDate);

        // Sum up SLA breaches using the existing projection
        long slaBreaches = ticketRepository.getSlaBreachByCategory(startDate).stream()
                .mapToLong(SlaCategoryData::getBreached).sum();

        // Reuse the response time math we built earlier
        Map<String, Object> responseTimes = getResponseTimeAnalytics(days);

        // 2. Bottom Row Charts (Category, Priority, Agent)
        List<Map<String, Object>> byCategory = ticketRepository.getTicketSummaryByCategory(startDate).stream().map(d -> {
            Map<String, Object> map = new HashMap<>();
            map.put(KEY_LABEL, d.getLabel() != null ? d.getLabel() : VAL_UNASSIGNED);
            map.put(KEY_COUNT, d.getCount());
            return map;
        }).toList();

        List<Map<String, Object>> byPriority = ticketRepository.getTicketSummaryByPriority(startDate).stream().map(d -> {
            Map<String, Object> map = new HashMap<>();
            map.put(KEY_LABEL, d.getLabel() != null ? d.getLabel() : VAL_UNASSIGNED);
            map.put(KEY_COUNT, d.getCount());
            return map;
        }).toList();

        List<Map<String, Object>> agentPerformance = ticketRepository.getAgentPerformance(startDate).stream().map(d -> {
            Map<String, Object> map = new HashMap<>();
            map.put("consultantId", d.getConsultantId());
            map.put("assigned", d.getTotalAssigned());
            map.put(KEY_RESOLVED, d.getTotalResolved());
            return map;
        }).toList();

        // 3. Package and Return
        Map<String, Object> response = new HashMap<>();
        response.put("totalTickets", totalTickets);
        response.put(KEY_RESOLVED, resolved);
        response.put("resolveRate", Math.round(resolveRate * 10.0) / 10.0);
        response.put("slaBreaches", slaBreaches);
        response.put("escalated", escalated);
        response.put("avgFirstResponse", responseTimes.get(KEY_AVG_RESPONSE));
        response.put("avgResolution", responseTimes.get(KEY_AVG_RESOLUTION));

        response.put("byCategory", byCategory);
        response.put("byPriority", byPriority);
        response.put("agentPerformance", agentPerformance);

        return response;
    }

    // ==========================================
    // ✅ NEW UTILITY: Dynamic SLA Math Engine
    // ==========================================
    private int getSlaResolveHours(Priority priority) {
        if (priority == null) return 24;
        return switch (priority) {
            case LOW -> 72;
            case MEDIUM -> 24;
            case HIGH -> 8;
            case URGENT -> 4;     // ✅ Matches Frontend
            case CRITICAL -> 2;   // ✅ Matches Frontend
        };
    }

    // ==========================================
    // ✅ UTILITY: Capitalize First Letter of Every Word
    // ==========================================
    private String formatCategoryName(String category) {
        if (category == null || category.trim().isEmpty()) return category;

        String[] words = category.trim().split("\\s+");
        StringBuilder formatted = new StringBuilder();

        for (String word : words) {
            if (!word.isEmpty()) {
                formatted.append(Character.toUpperCase(word.charAt(0)))
                        .append(word.substring(1).toLowerCase())
                        .append(" ");
            }
        }
        return formatted.toString().trim();
    }

    // --- MAPPERS ---

    private TicketResponse mapToTicketResponse(Ticket ticket) {
        // SECURE MAPPING: internalNotes intentionally omitted to prevent data leaks.
        // FIX: Added resolvedAt, closedAt to the constructor call so these are
        // returned on every ticket response. consultantName is null here — it is
        // enriched by the analytics service which does a Consultant lookup.
        return new TicketResponse(
                ticket.getId(),
                ticket.getTicketNumber(),
                ticket.getUserId(), ticket.getConsultantId(),
                ticket.getCategory(), ticket.getDescription(), ticket.getAttachmentUrl(),
                ticket.getPriority(), ticket.getStatus(),
                ticket.getSlaRespondBy(), ticket.getSlaResolveBy(), ticket.isSlaBreached(),
                ticket.getFirstRespondedAt(),   // mapped to firstResponseAt field
                ticket.isEscalated(), ticket.getEscalatedAt(), ticket.getEscalationReason(),
                ticket.getFeedbackRating(), ticket.getFeedbackText(),
                ticket.getCreatedAt(), ticket.getUpdatedAt(),
                ticket.getResolvedAt(), ticket.getClosedAt(),
                null  // consultantName — populated by analytics service, not here
        );
    }

    private TicketCommentResponse mapToCommentResponse(TicketComment comment) {
        return new TicketCommentResponse(
                comment.getId(), comment.getTicketId(), comment.getSenderId(),
                comment.isConsultantReply(), comment.getMessage(), comment.getCreatedAt()
        );
    }
}