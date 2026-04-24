package com.rupee.service;

import com.rupee.entity.BusinessHours;
import com.rupee.entity.Holiday;
import com.rupee.repository.BusinessHoursRepository;
import com.rupee.repository.HolidayRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

// ✅ The @Service annotation makes this injectable into TicketService
@Service
@RequiredArgsConstructor
public class SlaCalculationService {

    private final BusinessHoursRepository businessHoursRepository;
    private final HolidayRepository holidayRepository;

    /**
     * Calculates the exact deadline by skipping non-working hours and holidays.
     * If no business hours are configured in the DB, it falls back to standard 24/7 math.
     */
    public LocalDateTime calculateSlaDeadline(LocalDateTime startTime, int slaHours) {

        // Fetch all business hours and map them by DayOfWeek for fast lookups
        Map<DayOfWeek, BusinessHours> schedule = businessHoursRepository.findAll().stream()
                .collect(Collectors.toMap(BusinessHours::getDayOfWeek, b -> b));

        // Fetch all holidays and put them in a Set for fast lookups
        Set<LocalDate> holidays = holidayRepository.findAll().stream()
                .map(Holiday::getHolidayDate)
                .collect(Collectors.toSet());

        // Fallback: If the Admin hasn't set up the schedule yet, assume 24/7 support
        if (schedule.isEmpty()) {
            return startTime.plusHours(slaHours);
        }

        LocalDateTime currentCalcTime = startTime;
        int remainingHoursToAdd = slaHours;

        // Step forward 1 hour at a time until the SLA budget is consumed
        while (remainingHoursToAdd > 0) {
            currentCalcTime = currentCalcTime.plusHours(1);

            // Only deduct an hour from the SLA budget if it is actively working hours
            if (isWorkingTime(currentCalcTime, schedule, holidays)) {
                remainingHoursToAdd--;
            }
        }

        return currentCalcTime;
    }

    /**
     * Helper method to check if a specific hour is a valid working hour.
     */
    private boolean isWorkingTime(LocalDateTime time, Map<DayOfWeek, BusinessHours> schedule, Set<LocalDate> holidays) {
        // 1. Is it a holiday? (Timer pauses)
        if (holidays.contains(time.toLocalDate())) return false;

        // 2. Is it a working day? (e.g., skips Saturdays/Sundays)
        BusinessHours todaysHours = schedule.get(time.getDayOfWeek());
        if (todaysHours == null || !todaysHours.isWorkingDay()) return false;

        // 3. Is it within working hours? (e.g., between 9 AM and 5 PM)
        LocalTime t = time.toLocalTime();
        return !t.isBefore(todaysHours.getStartTime()) && !t.isAfter(todaysHours.getEndTime());
    }
}