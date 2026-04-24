package com.rupee.controller;

import com.rupee.repository.TicketRepository.TicketGraphData;
import com.rupee.service.BookingService;
import com.rupee.service.FeedbackService;
import com.rupee.service.TicketService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final TicketService ticketService;
    private final FeedbackService feedbackService; // ✅ Injected for Customer Satisfaction Analytics
    private final BookingService bookingService; // ✅ Injected for Revenue Analytics

    @GetMapping("/summaries")
    public ResponseEntity<Map<String, List<TicketGraphData>>> getGraphSummaries(
            @RequestParam(defaultValue = "WEEKLY") String period) {

        // ✅ Clean architecture: The controller just passes the request to the service layer.
        return ResponseEntity.ok(ticketService.getGraphSummaries(period));
    }

    // ✅ NEW: Fetch resolution analytics for the Admin charts
    @GetMapping("/analytics")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> getResolutionAnalytics(
            @RequestParam(defaultValue = "WEEKLY") String period) {
        return ResponseEntity.ok(ticketService.getResolutionAnalytics(period));
    }

    // ==========================================
    // 📈 NEW: TICKET VOLUME ANALYTICS
    // ==========================================
    @GetMapping("/ticket-volume")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> getTicketVolumeAnalytics(
            @RequestParam(defaultValue = "14") int days) { // Frontend passes 14, 60, or 180

        return ResponseEntity.ok(ticketService.getTicketVolumeAnalytics(days));
    }

    // ==========================================
    // 📈 NEW ANALYTICS TABS
    // ==========================================

    @GetMapping("/agent-performance")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> getAgentPerformance(@RequestParam(defaultValue = "14") int days) {
        return ResponseEntity.ok(ticketService.getAgentPerformanceAnalytics(days));
    }

    @GetMapping("/customer-satisfaction")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> getCustomerSatisfaction(@RequestParam(defaultValue = "14") int days) {
        return ResponseEntity.ok(feedbackService.getSatisfactionAnalytics(days));
    }

    @GetMapping("/sla-breach")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> getSlaBreach(@RequestParam(defaultValue = "14") int days) {
        return ResponseEntity.ok(ticketService.getSlaAnalytics(days));
    }

    @GetMapping("/revenue")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> getRevenue(@RequestParam(defaultValue = "14") int days) {
        return ResponseEntity.ok(bookingService.getRevenueAnalytics(days));
    }

    @GetMapping("/response-times")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> getResponseTimes(@RequestParam(defaultValue = "14") int days) {
        return ResponseEntity.ok(ticketService.getResponseTimeAnalytics(days));
    }

    @GetMapping("/reports")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> getAdvancedReports(
            @RequestParam(defaultValue = "14") int days,
            @RequestParam(defaultValue = "CATEGORY") String groupBy) {

        return ResponseEntity.ok(ticketService.getAdvancedReportsAnalytics(days, groupBy));
    }
}