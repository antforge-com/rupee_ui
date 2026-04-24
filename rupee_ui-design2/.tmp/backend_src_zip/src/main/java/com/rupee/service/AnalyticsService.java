package com.rupee.service;

import com.rupee.dto.response.TicketResponse;
import com.rupee.entity.*;
import com.rupee.enums.BookingEnums.BookingStatus;
import com.rupee.enums.SpecialBookingStatus;
import com.rupee.enums.TicketEnums.*;
import com.rupee.enums.TimeSlotEnums.*;
import com.rupee.enums.UserEnums.Role;
import com.rupee.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private final BookingRepository bookingRepository;
    private final FeedbackRepository feedbackRepository;
    private final UserRepository userRepository;
    private final UserRegistrationRepository userRegistrationRepository;
    private final ConsultantRepository consultantRepository;
    private final TicketRepository ticketRepository;
    private final SpecialBookingRepository specialBookingRepository;
    private final TimeSlotRepository timeSlotRepository;

    private static final String KEY_AMOUNT = "amount";
    private static final String KEY_COUNT = "count";
    private static final String KEY_REVENUE = "revenue";
    private static final String KEY_BOOKING_ID = "bookingId";
    private static final String KEY_CONSULTANT_ID = "consultantId";
    private static final String KEY_CLIENT_NAME = "clientName";
    private static final String KEY_STATUS = "status";
    private static final String KEY_MEETING_MODE = "meetingMode";
    private static final String KEY_PROFILE_PHOTO = "profilePhoto";
    private static final String VAL_UNKNOWN = "Unknown";
    private static final String KEY_BOOKING_ACTIVITY_CHART = "bookingActivityChart";

    // ==========================================
    // 📊 CONSULTANT ANALYTICS
    // ==========================================

    @Transactional(readOnly = true)
    public Map<String, Object> getConsultantOverviewCards(Long consultantId) {
        // 1. Merge Normal + Special Booking Counts
        long totalBookings = bookingRepository.countByConsultantId(consultantId) + specialBookingRepository.countByConsultantId(consultantId);
        long upcomingBookings = bookingRepository.countByConsultantIdAndBookingStatus(consultantId, BookingStatus.CONFIRMED) + specialBookingRepository.countByConsultantIdAndStatus(consultantId, SpecialBookingStatus.CONFIRMED);
        long cancelledBookings = bookingRepository.countByConsultantIdAndBookingStatus(consultantId, BookingStatus.CANCELLED) + specialBookingRepository.countByConsultantIdAndStatus(consultantId, SpecialBookingStatus.CANCELLED);
        long completedBookings = bookingRepository.countByConsultantIdAndBookingStatus(consultantId, BookingStatus.COMPLETED) + specialBookingRepository.countByConsultantIdAndStatus(consultantId, SpecialBookingStatus.COMPLETED);

        // 2. Merge Normal + Special Financial Metrics Safely
        BigDecimal normalRev = bookingRepository.calculateTotalRevenueByConsultant(consultantId);
        BigDecimal specialRev = specialBookingRepository.calculateTotalRevenueByConsultant(consultantId);
        BigDecimal totalEarnings = (normalRev != null ? normalRev : BigDecimal.ZERO).add(specialRev != null ? specialRev : BigDecimal.ZERO);

        // Calculate Average Revenue
        BigDecimal averageRevenue = BigDecimal.ZERO;
        if (totalBookings > 0) {
            averageRevenue = totalEarnings.divide(new BigDecimal(totalBookings), 2, RoundingMode.HALF_UP);
        }

        // Calculate Completion Rate
        double completionRate = 0.0;
        if (totalBookings > 0) {
            completionRate = ((double) completedBookings / totalBookings) * 100.0;
        }

        // Total Hours Consulted (From Special Bookings)
        long totalHours = specialBookingRepository.calculateTotalConsultationHours(consultantId);

        // 3. Rating
        Double averageRating = feedbackRepository.getAverageRatingForConsultant(consultantId);

        // Ticket Metrics
        long openTickets = ticketRepository.countByConsultantIdAndStatusNotIn(
                consultantId, Arrays.asList(Status.RESOLVED, Status.CLOSED)
        );
        long resolvedTickets = ticketRepository.countByConsultantIdAndStatus(consultantId, Status.RESOLVED);

        // Slot Utilization Rate
        long totalSlotsOpened = timeSlotRepository.countByConsultantId(consultantId);
        long totalSlotsBooked = timeSlotRepository.countByConsultantIdAndStatus(consultantId, SlotStatus.BOOKED);

        double slotUtilizationRate = 0.0;
        if (totalSlotsOpened > 0) {
            slotUtilizationRate = ((double) totalSlotsBooked / totalSlotsOpened) * 100.0;
        }

        Map<String, Object> response = new HashMap<>();
        response.put("totalBookings", totalBookings);
        response.put("upcomingBookings", upcomingBookings);
        response.put("cancelledBookings", cancelledBookings);
        response.put("totalEarnings", totalEarnings);
        response.put("averageRevenue", averageRevenue);
        response.put("totalHoursConsulted", totalHours);
        response.put("completionRate", Math.round(completionRate * 10.0) / 10.0);
        response.put("slotUtilizationRate", Math.round(slotUtilizationRate * 10.0) / 10.0);
        response.put("averageRating", Math.round(averageRating * 10.0) / 10.0);
        response.put("openTickets", openTickets);
        response.put("resolvedTickets", resolvedTickets);

        return response;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getConsultantCharts(Long consultantId) {
        // 1. Revenue Chart (Jan-Dec) - Merge Normal and Special Revenues
        List<BigDecimal> normalRev = fillMissingMonthsWithZero(bookingRepository.getMonthlyRevenueForConsultant(consultantId), KEY_REVENUE);
        List<BigDecimal> specialRev = fillMissingMonthsWithZero(specialBookingRepository.getMonthlyRevenueForConsultant(consultantId), KEY_REVENUE);

        List<BigDecimal> mergedRevenue = new ArrayList<>();
        for(int i=0; i<12; i++) mergedRevenue.add(normalRev.get(i).add(specialRev.get(i)));

        // 2. Booking Activity Chart (Jan-Dec)
        List<Map<String, Object>> rawActivity = bookingRepository.getMonthlyBookingActivityForConsultant(consultantId);
        List<BigDecimal> monthlyActivity = fillMissingMonthsWithZero(rawActivity, KEY_COUNT);

        // 3. Feedback Distribution
        List<Map<String, Object>> ratingDist = feedbackRepository.getRatingDistributionForConsultant(consultantId);

        // Pie Chart Data
        List<Map<String, Object>> revenueByMode = bookingRepository.getRevenueByMeetingModeForConsultant(consultantId);

        // Helpdesk Support Chart
        List<Map<String, Object>> ticketsByStatus = ticketRepository.getConsultantTicketsByStatus(consultantId);

        return Map.of(
                "monthlyRevenueChart", mergedRevenue,
                KEY_BOOKING_ACTIVITY_CHART, monthlyActivity,
                "ratingDistribution", ratingDist,
                "revenueByModeChart", revenueByMode,
                "ticketsByStatusChart", ticketsByStatus
        );
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getConsultantRecentTransactions(Long consultantId) {
        List<Booking> recentBookings = bookingRepository.findByConsultantIdOrderByCreatedAtDesc(consultantId, PageRequest.of(0, 5));

        return recentBookings.stream().map(b -> {
            Map<String, Object> map = new HashMap<>();
            map.put(KEY_BOOKING_ID, b.getId());
            map.put(KEY_AMOUNT, b.getTotalAmount());
            map.put(KEY_STATUS, b.getBookingStatus());
            map.put("date", b.getCreatedAt());
            map.put(KEY_MEETING_MODE, b.getMeetingMode());

            // Fetch Client Name safely
            String clientName = userRegistrationRepository.findByUserId(b.getUserId())
                    .map(UserRegistration::getName).orElse("Unknown Client");
            map.put(KEY_CLIENT_NAME, clientName);

            return map;
        }).toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getConsultantUpcomingAppointments(Long consultantId) {
        List<Booking> upcoming = bookingRepository.findByConsultantIdAndBookingStatusOrderByCreatedAtDesc(consultantId, BookingStatus.CONFIRMED, PageRequest.of(0, 5));
        return upcoming.stream().map(b -> {
            Map<String, Object> map = new HashMap<>();
            map.put(KEY_BOOKING_ID, b.getId());
            map.put("date", b.getCreatedAt());
            map.put(KEY_MEETING_MODE, b.getMeetingMode());
            map.put(KEY_CLIENT_NAME, userRegistrationRepository.findByUserId(b.getUserId()).map(UserRegistration::getName).orElse(VAL_UNKNOWN));
            return map;
        }).toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getConsultantRecentFeedbacks(Long consultantId) {
        List<Feedback> feedbacks = feedbackRepository.findByConsultantIdOrderByCreatedAtDesc(consultantId, PageRequest.of(0, 5));
        return feedbacks.stream().map(f -> {
            Map<String, Object> map = new HashMap<>();
            map.put("rating", f.getRating());
            map.put("comments", f.getComments() != null ? f.getComments() : "");
            map.put("date", f.getCreatedAt());
            map.put(KEY_CLIENT_NAME, userRegistrationRepository.findByUserId(f.getUserId()).map(UserRegistration::getName).orElse("Anonymous"));
            return map;
        }).toList();
    }

    // ==========================================
    // 👤 USER ANALYTICS (GUEST/SUBSCRIBER/MEMBER)
    // ==========================================

    @Transactional(readOnly = true)
    public Map<String, Object> getUserOverviewCards(Long userId) {
        // Merge Counts
        long upcomingSessions = bookingRepository.countByUserIdAndBookingStatus(userId, BookingStatus.CONFIRMED) + specialBookingRepository.countByUserIdAndStatus(userId, SpecialBookingStatus.CONFIRMED);
        long completedSessions = bookingRepository.countByUserIdAndBookingStatus(userId, BookingStatus.COMPLETED) + specialBookingRepository.countByUserIdAndStatus(userId, SpecialBookingStatus.COMPLETED);

        // Count active tickets (excluding RESOLVED and CLOSED)
        long activeTickets = ticketRepository.countByUserIdAndStatusNotIn(
                userId, Arrays.asList(Status.RESOLVED, Status.CLOSED)
        );

        // Merge Spendings
        BigDecimal normalSpent = bookingRepository.calculateTotalSpentByUser(userId);
        BigDecimal specialSpent = specialBookingRepository.calculateTotalSpentByUser(userId);
        BigDecimal totalSpent = (normalSpent != null ? normalSpent : BigDecimal.ZERO).add(specialSpent != null ? specialSpent : BigDecimal.ZERO);

        BigDecimal totalSaved = bookingRepository.calculateTotalSavedByUser(userId);

        return Map.of(
                "upcomingSessions", upcomingSessions,
                "completedSessions", completedSessions,
                "activeTickets", activeTickets,
                "totalSpent", totalSpent,
                "totalSaved", totalSaved != null ? totalSaved : BigDecimal.ZERO
        );
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getUserRecentActivities(Long userId) {
        // Fetching 5 recent bookings to populate the recent activity timeline
        List<Booking> recentBookings = bookingRepository.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 5));

        return recentBookings.stream().map(b -> {
            Map<String, Object> map = new HashMap<>();
            map.put("activityType", "BOOKING");
            map.put("id", b.getId());
            map.put(KEY_STATUS, b.getBookingStatus());
            map.put(KEY_AMOUNT, b.getTotalAmount());
            map.put("date", b.getCreatedAt());
            map.put(KEY_MEETING_MODE, b.getMeetingMode());

            // Fetch the assigned Consultant's name safely
            if (b.getConsultantId() != null) {
                String consultantName = consultantRepository.findById(b.getConsultantId())
                        .map(Consultant::getName).orElse("Unknown Consultant");
                map.put("consultantName", consultantName);
            }

            return map;
        }).toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getUserCharts(Long userId) {
        // 1. Spending Trend Chart - Merge Normal and Special Spending
        List<BigDecimal> normalSpend = fillMissingMonthsWithZero(bookingRepository.getMonthlySpendingForUser(userId), KEY_REVENUE);
        List<BigDecimal> specialSpend = fillMissingMonthsWithZero(specialBookingRepository.getMonthlySpendingForUser(userId), KEY_REVENUE);

        List<BigDecimal> mergedSpending = new ArrayList<>();
        for(int i=0; i<12; i++) mergedSpending.add(normalSpend.get(i).add(specialSpend.get(i)));

        // 2. Booking Activity Chart
        List<Map<String, Object>> rawActivity = bookingRepository.getMonthlyBookingActivityForUser(userId);
        List<BigDecimal> monthlyActivity = fillMissingMonthsWithZero(rawActivity, KEY_COUNT);

        return Map.of(
                "spendingTrendChart", mergedSpending,
                KEY_BOOKING_ACTIVITY_CHART, monthlyActivity
        );
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getUserUpcomingAppointments(Long userId) {
        List<Booking> upcoming = bookingRepository.findByUserIdAndBookingStatusOrderByCreatedAtDesc(userId, BookingStatus.CONFIRMED, PageRequest.of(0, 5));
        return upcoming.stream().map(b -> {
            Map<String, Object> map = new HashMap<>();
            map.put(KEY_BOOKING_ID, b.getId());
            map.put("date", b.getCreatedAt());
            map.put(KEY_MEETING_MODE, b.getMeetingMode());
            map.put("consultantName", consultantRepository.findById(b.getConsultantId()).map(Consultant::getName).orElse(VAL_UNKNOWN));
            return map;
        }).toList();
    }

    // ==========================================
    // 👑 ADMIN ANALYTICS
    // ==========================================

    @Transactional(readOnly = true)
    public Map<String, Object> getAdminOverviewCards() {
        long totalUsers = userRepository.countByRole(Role.MEMBER) + userRepository.countByRole(Role.SUBSCRIBER);
        long totalConsultants = userRepository.countByRole(Role.CONSULTANT);
        long totalTickets = ticketRepository.count();

        // Merge Platform Revenues
        BigDecimal normalPlatformRev = bookingRepository.calculateTotalRevenue();
        BigDecimal specialPlatformRev = specialBookingRepository.calculateTotalPlatformRevenue();
        BigDecimal platformRevenue = (normalPlatformRev != null ? normalPlatformRev : BigDecimal.ZERO).add(specialPlatformRev != null ? specialPlatformRev : BigDecimal.ZERO);

        return Map.of(
                "totalUsers", totalUsers,
                "totalConsultants", totalConsultants,
                "totalTickets", totalTickets,
                "platformRevenue", platformRevenue
        );
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getAdminCharts() {
        // 1. Platform Revenue Chart - Merge Normal and Special
        List<BigDecimal> normalRev = fillMissingMonthsWithZero(bookingRepository.getPlatformMonthlyRevenue(), KEY_REVENUE);
        List<BigDecimal> specialRev = fillMissingMonthsWithZero(specialBookingRepository.getPlatformMonthlyRevenue(), KEY_REVENUE);

        List<BigDecimal> mergedRevenue = new ArrayList<>();
        for(int i=0; i<12; i++) mergedRevenue.add(normalRev.get(i).add(specialRev.get(i)));

        // 2. REPLACED: Platform Booking Activity (Sessions) Chart
        List<Map<String, Object>> rawActivity = bookingRepository.getPlatformMonthlyBookingActivity();
        List<BigDecimal> monthlyActivity = fillMissingMonthsWithZero(rawActivity, KEY_COUNT);

        // Pie Chart Data
        List<Map<String, Object>> revenueByMode = bookingRepository.getPlatformRevenueByMeetingMode();

        // Helpdesk Support Charts
        List<Map<String, Object>> ticketsByStatus = ticketRepository.getPlatformTicketsByStatus();

        Map<String, Object> response = new HashMap<>();
        response.put("platformRevenueChart", mergedRevenue);
        response.put(KEY_BOOKING_ACTIVITY_CHART, monthlyActivity); // ✅ CHANGED from userGrowthChart
        response.put("revenueByModeChart", revenueByMode);
        response.put("ticketsByStatusChart", ticketsByStatus);

        return response;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getTopConsultants() {
        List<Map<String, Object>> topData = bookingRepository.getTopConsultantsByRevenue(PageRequest.of(0, 5));

        List<Map<String, Object>> enrichedData = new ArrayList<>();
        for (Map<String, Object> data : topData) {
            Long consultantId = (Long) data.get(KEY_CONSULTANT_ID);
            Consultant consultant = consultantRepository.findById(consultantId).orElse(null);

            if (consultant != null) {
                Map<String, Object> enriched = new HashMap<>(data);
                enriched.put("name", consultant.getName());
                enriched.put("designation", consultant.getDesignation());
                enriched.put(KEY_PROFILE_PHOTO, consultant.getProfilePhoto());
                enriched.put("rating", consultant.getRating());
                enrichedData.add(enriched);
            }
        }
        return enrichedData;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAdminRecentTransactions() {
        List<Booking> recentBookings = bookingRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 8));
        return recentBookings.stream().map(b -> {
            Map<String, Object> map = new HashMap<>();
            map.put(KEY_BOOKING_ID, b.getId());
            map.put(KEY_AMOUNT, b.getTotalAmount());
            map.put(KEY_STATUS, b.getBookingStatus());
            map.put("date", b.getCreatedAt());
            map.put(KEY_CONSULTANT_ID, b.getConsultantId());
            return map;
        }).toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAdminTopRatedConsultants() {
        List<Map<String, Object>> topData = feedbackRepository.getTopRatedConsultants(PageRequest.of(0, 5));

        List<Map<String, Object>> enrichedData = new ArrayList<>();
        for (Map<String, Object> data : topData) {
            Long consultantId = (Long) data.get(KEY_CONSULTANT_ID);
            Consultant consultant = consultantRepository.findById(consultantId).orElse(null);

            if (consultant != null) {
                Map<String, Object> enriched = new HashMap<>(data);
                enriched.put("name", consultant.getName());
                enriched.put(KEY_PROFILE_PHOTO, consultant.getProfilePhoto());
                enriched.put("designation", consultant.getDesignation());
                enrichedData.add(enriched);
            }
        }
        return enrichedData;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAdminRecentUsers() {
        List<UserRegistration> recentUsers = userRegistrationRepository.findTop5ByOrderByMemberSinceDesc();

        return recentUsers.stream().map(u -> {
            Map<String, Object> map = new HashMap<>();
            map.put("name", u.getName());
            map.put("email", u.getEmail());
            map.put("dateJoined", u.getMemberSince());
            map.put(KEY_PROFILE_PHOTO, u.getProfileImageUrl());
            return map;
        }).toList();
    }

    // --- Utility Method for UI Charting Libraries ---
    private List<BigDecimal> fillMissingMonthsWithZero(List<Map<String, Object>> rawData, String valueKey) {
        BigDecimal[] months = new BigDecimal[12];
        Arrays.fill(months, BigDecimal.ZERO);

        for (Map<String, Object> data : rawData) {
            Integer month = (Integer) data.get("month");
            if (month != null && month >= 1 && month <= 12) {
                Object value = data.get(valueKey);
                if (value instanceof BigDecimal bigdecimal) {
                    months[month - 1] = bigdecimal;
                } else if (value instanceof Number number) {
                    months[month - 1] = new BigDecimal(number.toString());
                }
            }
        }
        return Arrays.asList(months);
    }

    // ==========================================
    // 👤 USER ANALYTICS WIDGETS
    // ==========================================
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getUserRecentTickets(Long userId) {
        List<Ticket> recentTickets = ticketRepository.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 5));

        return recentTickets.stream().map(t -> {
            Map<String, Object> map = new HashMap<>();
            map.put("ticketId", t.getId());
            map.put("ticketNumber", t.getTicketNumber()); // ✅ Added for UI reference

            // ✅ FIX: Use a snippet of the description since 'subject' doesn't exist
            String snippet = t.getDescription();
            if (snippet != null && snippet.length() > 40) {
                snippet = snippet.substring(0, 40) + "...";
            }
            map.put("subject", snippet);

            map.put("category", t.getCategory()); // ✅ Added for extra UI detail
            map.put(KEY_STATUS, t.getStatus());
            map.put("priority", t.getPriority());
            map.put("date", t.getCreatedAt());
            return map;
        }).toList();
    }

    // ==========================================
    // 👑 ADMIN ANALYTICS WIDGETS
    // ==========================================
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAdminRecentTickets() {
        List<Ticket> recentTickets = ticketRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 5));

        return recentTickets.stream().map(t -> {
            Map<String, Object> map = new HashMap<>();
            map.put("ticketId", t.getId());
            map.put("ticketNumber", t.getTicketNumber()); // ✅ Added for UI reference

            // ✅ FIX: Use a snippet of the description since 'subject' doesn't exist
            String snippet = t.getDescription();
            if (snippet != null && snippet.length() > 40) {
                snippet = snippet.substring(0, 40) + "...";
            }
            map.put("subject", snippet);

            map.put("category", t.getCategory()); // ✅ Added for extra UI detail
            map.put(KEY_STATUS, t.getStatus());
            map.put("priority", t.getPriority());
            map.put("date", t.getCreatedAt());

            // Get the user who raised it
            map.put(KEY_CLIENT_NAME, userRegistrationRepository.findByUserId(t.getUserId())
                    .map(UserRegistration::getName).orElse(VAL_UNKNOWN));
            return map;
        }).toList();
    }

    // ==========================================
    // 📊 ANALYTICS: ENRICHED TICKET DATA
    // ==========================================

    /**
     * Returns ALL tickets for the platform with consultantName populated.
     * FIX: The existing GET /tickets endpoint paginates (default 10 rows), so the
     * analytics module was computing Ticket Volume, Agent Performance, Response Times
     * and SLA Breach metrics on only a fraction of the data. This method fetches
     * every ticket and enriches each one with the consultant's display name so
     * the frontend can group metrics by agent without making N extra API calls.
     */
    @Transactional(readOnly = true)
    public List<TicketResponse> getAllTicketsForAnalytics() {
        List<Ticket> tickets = ticketRepository.findAllForAnalytics();
        // Build a consultant name cache to avoid N+1 queries
        Map<Long, String> nameCache = new HashMap<>();

        return tickets.stream()
                .map(t -> mapTicketToAnalyticsResponse(t, nameCache))
                .toList();
    }

    /**
     * Returns ALL tickets assigned to a specific consultant with consultantName populated.
     * FIX: The existing GET /tickets/consultant/{id} endpoint paginates, so the
     * consultant analytics module was working on an incomplete dataset. This method
     * returns the full assignment history for accurate per-agent metrics.
     */
    @Transactional(readOnly = true)
    public List<TicketResponse> getConsultantTicketsForAnalytics(Long consultantId) {
        List<Ticket> tickets = ticketRepository.findAllByConsultantIdForAnalytics(consultantId);
        Map<Long, String> nameCache = new HashMap<>();
        return tickets.stream().map(t -> mapTicketToAnalyticsResponse(t, nameCache)).toList();
    }

    /**
     * Maps a Ticket entity to a TicketResponse enriched with the consultant's name.
     * Uses a shared nameCache map to avoid repeated DB lookups per ticket.
     */
    private TicketResponse mapTicketToAnalyticsResponse(Ticket t, Map<Long, String> nameCache) {
        TicketResponse r = new TicketResponse();
        r.setId(t.getId());
        r.setTicketNumber(t.getTicketNumber());
        r.setUserId(t.getUserId());
        r.setConsultantId(t.getConsultantId());
        r.setCategory(t.getCategory());
        r.setDescription(t.getDescription());
        r.setAttachmentUrl(t.getAttachmentUrl());
        r.setPriority(t.getPriority());
        r.setStatus(t.getStatus());
        r.setSlaRespondBy(t.getSlaRespondBy());
        r.setSlaResolveBy(t.getSlaResolveBy());
        r.setSlaBreached(t.isSlaBreached());
        // FIX: Field renamed firstRespondedAt → firstResponseAt in TicketResponse
        r.setFirstResponseAt(t.getFirstRespondedAt());
        r.setEscalated(t.isEscalated());
        r.setEscalatedAt(t.getEscalatedAt());
        r.setEscalationReason(t.getEscalationReason());
        r.setFeedbackRating(t.getFeedbackRating());
        r.setFeedbackText(t.getFeedbackText());
        r.setCreatedAt(t.getCreatedAt());
        r.setUpdatedAt(t.getUpdatedAt());
        // FIX: Populate the new resolvedAt / closedAt fields
        r.setResolvedAt(t.getResolvedAt());
        r.setClosedAt(t.getClosedAt());

        // FIX: Resolve and cache consultant name — without this every ticket
        // appears as "Unassigned" in the Agent Performance analytics module
        if (t.getConsultantId() != null) {
            String name = nameCache.computeIfAbsent(
                    t.getConsultantId(),
                    id -> consultantRepository.findById(id)
                            .map(Consultant::getName)
                            .orElse(null)
            );
            r.setConsultantName(name);
        }
        return r;
    }


}