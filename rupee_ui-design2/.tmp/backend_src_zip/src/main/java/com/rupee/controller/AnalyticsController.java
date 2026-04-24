package com.rupee.controller;

import com.rupee.dto.response.TicketResponse;
import com.rupee.entity.User;
import com.rupee.service.AnalyticsService;
import com.rupee.service.SecurityService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@CrossOrigin(origins = "*") // ✅ Prevents CORS issues on the frontend
@RestController
@RequestMapping("/api/analytics")
@RequiredArgsConstructor
public class AnalyticsController {

    private final AnalyticsService analyticsService;
    private final SecurityService securityService;

    // ==========================================
    // 📊 CONSULTANT DASHBOARD APIs
    // ==========================================

    @GetMapping("/consultant/overview")
    @PreAuthorize("hasAuthority('ROLE_CONSULTANT')")
    public ResponseEntity<Map<String, Object>> getConsultantOverview() {
        User currentUser = securityService.getCurrentUser();
        return ResponseEntity.ok(analyticsService.getConsultantOverviewCards(currentUser.getId()));
    }

    @GetMapping("/consultant/charts")
    @PreAuthorize("hasAuthority('ROLE_CONSULTANT')")
    public ResponseEntity<Map<String, Object>> getConsultantCharts() {
        User currentUser = securityService.getCurrentUser();
        return ResponseEntity.ok(analyticsService.getConsultantCharts(currentUser.getId()));
    }

    @GetMapping("/consultant/recent-transactions")
    @PreAuthorize("hasAuthority('ROLE_CONSULTANT')")
    public ResponseEntity<List<Map<String, Object>>> getConsultantRecentTransactions() {
        User currentUser = securityService.getCurrentUser();
        return ResponseEntity.ok(analyticsService.getConsultantRecentTransactions(currentUser.getId()));
    }

    @GetMapping("/consultant/upcoming-appointments")
    @PreAuthorize("hasAuthority('ROLE_CONSULTANT')")
    public ResponseEntity<List<Map<String, Object>>> getConsultantUpcomingAppointments() {
        return ResponseEntity.ok(analyticsService.getConsultantUpcomingAppointments(securityService.getCurrentUser().getId()));
    }

    @GetMapping("/consultant/recent-feedbacks")
    @PreAuthorize("hasAuthority('ROLE_CONSULTANT')")
    public ResponseEntity<List<Map<String, Object>>> getConsultantRecentFeedbacks() {
        return ResponseEntity.ok(analyticsService.getConsultantRecentFeedbacks(securityService.getCurrentUser().getId()));
    }

    // ==========================================
    // 👑 ADMIN DASHBOARD APIs
    // ==========================================

    @GetMapping("/admin/overview")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Map<String, Object>> getAdminOverview() {
        return ResponseEntity.ok(analyticsService.getAdminOverviewCards());
    }

    @GetMapping("/admin/charts")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<Map<String, Object>> getAdminCharts() {
        return ResponseEntity.ok(analyticsService.getAdminCharts());
    }

    @GetMapping("/admin/top-consultants")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<List<Map<String, Object>>> getTopConsultants() {
        return ResponseEntity.ok(analyticsService.getTopConsultants());
    }

    @GetMapping("/admin/recent-transactions")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<List<Map<String, Object>>> getAdminRecentTransactions() {
        return ResponseEntity.ok(analyticsService.getAdminRecentTransactions());
    }

    @GetMapping("/admin/top-rated-consultants")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<List<Map<String, Object>>> getAdminTopRatedConsultants() {
        return ResponseEntity.ok(analyticsService.getAdminTopRatedConsultants());
    }

    @GetMapping("/admin/recent-users")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<List<Map<String, Object>>> getAdminRecentUsers() {
        return ResponseEntity.ok(analyticsService.getAdminRecentUsers());
    }

    @GetMapping("/admin/recent-tickets")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<List<Map<String, Object>>> getAdminRecentTickets() {
        return ResponseEntity.ok(analyticsService.getAdminRecentTickets());
    }

    // ==========================================
    // 👤 USER DASHBOARD APIs (GUEST, SUBSCRIBER, MEMBER)
    // ==========================================

    @GetMapping("/user/overview")
    @PreAuthorize("hasAnyAuthority('ROLE_GUEST', 'ROLE_SUBSCRIBER', 'ROLE_MEMBER')")
    public ResponseEntity<Map<String, Object>> getUserOverview() {
        User currentUser = securityService.getCurrentUser();
        return ResponseEntity.ok(analyticsService.getUserOverviewCards(currentUser.getId()));
    }

    @GetMapping("/user/recent-activities")
    @PreAuthorize("hasAnyAuthority('ROLE_GUEST', 'ROLE_SUBSCRIBER', 'ROLE_MEMBER')")
    public ResponseEntity<List<Map<String, Object>>> getUserRecentActivities() {
        User currentUser = securityService.getCurrentUser();
        return ResponseEntity.ok(analyticsService.getUserRecentActivities(currentUser.getId()));
    }

    @GetMapping("/user/charts")
    @PreAuthorize("hasAnyAuthority('ROLE_GUEST', 'ROLE_SUBSCRIBER', 'ROLE_MEMBER')")
    public ResponseEntity<Map<String, Object>> getUserCharts() {
        User currentUser = securityService.getCurrentUser();
        return ResponseEntity.ok(analyticsService.getUserCharts(currentUser.getId()));
    }

    @GetMapping("/user/upcoming-appointments")
    @PreAuthorize("hasAnyAuthority('ROLE_GUEST', 'ROLE_SUBSCRIBER', 'ROLE_MEMBER')")
    public ResponseEntity<List<Map<String, Object>>> getUserUpcomingAppointments() {
        return ResponseEntity.ok(analyticsService.getUserUpcomingAppointments(securityService.getCurrentUser().getId()));
    }

    @GetMapping("/user/recent-tickets")
    @PreAuthorize("hasAnyAuthority('ROLE_GUEST', 'ROLE_SUBSCRIBER', 'ROLE_MEMBER')")
    public ResponseEntity<List<Map<String, Object>>> getUserRecentTickets() {
        return ResponseEntity.ok(analyticsService.getUserRecentTickets(securityService.getCurrentUser().getId()));
    }

    // ==========================================
    // 📊 ANALYTICS: ENRICHED TICKET ENDPOINTS
    // ==========================================

    /**
     * GET /api/analytics/tickets/all
     * FIX: The existing GET /api/tickets endpoint paginates (10 rows by default).
     * The analytics frontend was therefore computing Ticket Volume, Agent Performance,
     * Response Times, and SLA Breach charts from only the first page of tickets.
     * This endpoint returns ALL tickets enriched with consultantName, resolvedAt,
     * closedAt and firstResponseAt — the exact fields the analytics module needs to
     * compute accurate metrics on the full dataset.
     */
    @GetMapping("/tickets/all")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<List<TicketResponse>> getAllTicketsForAnalytics() {
        return ResponseEntity.ok(analyticsService.getAllTicketsForAnalytics());
    }

    /**
     * GET /api/analytics/tickets/consultant
     * FIX: Same pagination problem as above, scoped to the authenticated consultant.
     * Returns ALL tickets assigned to the current consultant, enriched with the
     * fields needed for the analytics module (resolvedAt, closedAt, firstResponseAt,
     * consultantName).
     */
    @GetMapping("/tickets/consultant")
    @PreAuthorize("hasAuthority('ROLE_CONSULTANT')")
    public ResponseEntity<List<TicketResponse>> getConsultantTicketsForAnalytics() {
        User currentUser = securityService.getCurrentUser();
        return ResponseEntity.ok(analyticsService.getConsultantTicketsForAnalytics(currentUser.getId()));
    }

}
