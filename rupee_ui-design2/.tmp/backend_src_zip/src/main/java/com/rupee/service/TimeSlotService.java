package com.rupee.service;

import com.rupee.dto.request.TimeSlotRequest;
import com.rupee.dto.response.TimeSlotResponse;
import com.rupee.entity.MasterTimeSlot;
import com.rupee.entity.TimeSlot;
import com.rupee.entity.ConsultantSpecialDay;
import com.rupee.enums.TimeSlotEnums.SlotStatus;
import com.rupee.repository.MasterTimeSlotRepository;
import com.rupee.repository.TimeSlotRepository;
import com.rupee.repository.ConsultantSpecialDayRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TimeSlotService {

    private final TimeSlotRepository timeSlotRepository;
    private final MasterTimeSlotRepository masterTimeSlotRepository;
    private final ConsultantSpecialDayRepository specialDayRepository; // ✅ Added

    // --- CONFIGURABLE VALUES ---
    @Value("${app.booking.window.days-before:2}")
    private int daysBefore;

    @Value("${app.booking.window.days-after:2}")
    private int daysAfter;

    // === CRUD OPERATIONS ===

    @Transactional
    public TimeSlotResponse createSlot(TimeSlotRequest request) {
        if (!masterTimeSlotRepository.existsById(request.getMasterTimeSlotId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Master Time Slot ID");
        }

        // 🚨 NEW: Block normal timeslot generation on Special Booking Days
        if (specialDayRepository.existsByConsultantIdAndSpecialDate(request.getConsultantId(), request.getSlotDate())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot generate standard timeslots. This date is enabled exclusively for Special Bookings.");
        }

        // 🚨 SAFETY CHECK: Prevent duplicate time slots from being created
        boolean slotExists = timeSlotRepository.existsByConsultantIdAndSlotDateAndMasterTimeSlotId(
                request.getConsultantId(), request.getSlotDate(), request.getMasterTimeSlotId()
        );

        if (slotExists) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A time slot for this exact date and time already exists.");
        }

        TimeSlot slot = TimeSlot.builder()
                .consultantId(request.getConsultantId())
                .slotDate(request.getSlotDate())
                .masterTimeSlotId(request.getMasterTimeSlotId())
                .durationMinutes(request.getDurationMinutes())
                .status(request.getStatus() != null ? request.getStatus() : SlotStatus.AVAILABLE)
                .build();
        return mapToResponse(timeSlotRepository.save(slot));
    }

    // ✅ NEW BULK SAVE METHOD
    @Transactional
    public List<TimeSlotResponse> createSlotsInBulk(List<TimeSlotRequest> requests) {
        List<TimeSlot> slotsToSave = new ArrayList<>();

        // Track exactly WHY slots are being rejected
        int duplicateCount = 0;
        int specialDayCount = 0;
        int invalidMasterCount = 0;

        for (TimeSlotRequest req : requests) {
            if (!masterTimeSlotRepository.existsById(req.getMasterTimeSlotId())) {
                invalidMasterCount++;
            } else if (specialDayRepository.existsByConsultantIdAndSpecialDate(req.getConsultantId(), req.getSlotDate())) {
                specialDayCount++; // Catch accidental generations on special days!
            } else if (timeSlotRepository.existsByConsultantIdAndSlotDateAndMasterTimeSlotId(
                    req.getConsultantId(), req.getSlotDate(), req.getMasterTimeSlotId())) {
                duplicateCount++;
            } else {
                slotsToSave.add(buildTimeSlot(req));
            }
        }

        // Delegate error handling to a helper method to satisfy SonarQube
        handleBulkCreationErrors(slotsToSave.isEmpty(), duplicateCount, specialDayCount, invalidMasterCount);

        // Save all valid slots in one fast batch
        List<TimeSlot> savedSlots = timeSlotRepository.saveAll(slotsToSave);
        return mapListToResponse(savedSlots);
    }

    // --- NEW HELPER METHODS TO REDUCE COGNITIVE COMPLEXITY ---

    private TimeSlot buildTimeSlot(TimeSlotRequest req) {
        return TimeSlot.builder()
                .consultantId(req.getConsultantId())
                .slotDate(req.getSlotDate())
                .masterTimeSlotId(req.getMasterTimeSlotId())
                .durationMinutes(req.getDurationMinutes())
                .status(req.getStatus() != null ? req.getStatus() : SlotStatus.AVAILABLE)
                .build();
    }

    private void handleBulkCreationErrors(boolean isEmpty, int duplicates, int specialDays, int invalidMasters) {
        if (!isEmpty) {
            return;
        }

        List<String> reasons = new ArrayList<>();
        if (duplicates > 0) reasons.add(duplicates + " already exist");
        if (specialDays > 0) reasons.add(specialDays + " fall on Special Booking days");
        if (invalidMasters > 0) reasons.add(invalidMasters + " have invalid Master Slot IDs");

        String errorMessage = "No time slots were created: " + String.join(", ", reasons) + ".";
        throw new ResponseStatusException(HttpStatus.CONFLICT, errorMessage);
    }

    @Transactional(readOnly = true)
    public TimeSlotResponse getSlotById(Long id) {
        TimeSlot slot = timeSlotRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Slot not found"));
        return mapToResponse(slot);
    }

    @Transactional
    public TimeSlotResponse updateSlot(Long id, TimeSlotRequest request) {
        TimeSlot slot = timeSlotRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Slot not found"));

        if (!masterTimeSlotRepository.existsById(request.getMasterTimeSlotId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Master Time Slot ID");
        }

        // 🚨 NEW: Block moving an existing timeslot to a Special Booking Day
        if (specialDayRepository.existsByConsultantIdAndSpecialDate(slot.getConsultantId(), request.getSlotDate())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot move timeslot to this date. It is enabled exclusively for Special Bookings.");
        }

        // 🚨 SAFETY CHECK: Implemented duplicate check excluding the current slot ID
        boolean duplicateExists = timeSlotRepository.existsByConsultantIdAndSlotDateAndMasterTimeSlotIdAndIdNot(
                slot.getConsultantId(), request.getSlotDate(), request.getMasterTimeSlotId(), id
        );

        if (duplicateExists) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot update: Another time slot already exists at this exact date and time.");
        }

        slot.setSlotDate(request.getSlotDate());
        slot.setMasterTimeSlotId(request.getMasterTimeSlotId());
        slot.setDurationMinutes(request.getDurationMinutes());

        if (request.getStatus() != null) {
            slot.setStatus(request.getStatus());
        }

        return mapToResponse(timeSlotRepository.save(slot));
    }

    @Transactional
    public void deleteSlot(Long id) {
        if (!timeSlotRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Slot not found");
        }
        timeSlotRepository.deleteById(id);
    }

    // === FRONTEND DATA FETCH LOGIC ===

    @Transactional(readOnly = true)
    public List<TimeSlotResponse> getAllSlotsForConsultant(Long consultantId) {
        List<TimeSlot> slots = timeSlotRepository.findByConsultantIdOrderBySlotDateAscMasterTimeSlotIdAsc(consultantId);
        return mapListToResponse(slots);
    }

    @Transactional(readOnly = true)
    public List<TimeSlotResponse> getAvailableSlotsForConsultant(Long consultantId) {
        List<TimeSlot> slots = timeSlotRepository.findByConsultantIdAndStatusOrderBySlotDateAscMasterTimeSlotIdAsc(
                consultantId, SlotStatus.AVAILABLE);
        return mapListToResponse(slots);
    }

    // === BUSINESS LOGIC ===

    @Transactional(readOnly = true)
    public List<TimeSlotResponse> getAvailableSlotsForWindow(Long consultantId) {

        // ✅ ALL DAYS WORKING: Empty list means no days are automatically skipped
        List<DayOfWeek> standardOffDays = List.of();
        LocalDate currentWorkingDay = getCurrentWorkingDay(LocalDate.now(), standardOffDays);

        // Dynamically calculate based on application.properties
        LocalDate startDate = getOffsetWorkingDay(currentWorkingDay, -daysBefore, standardOffDays);
        LocalDate endDate = getOffsetWorkingDay(currentWorkingDay, daysAfter, standardOffDays);

        List<TimeSlot> slots = timeSlotRepository
                .findByConsultantIdAndStatusAndSlotDateBetweenOrderBySlotDateAscMasterTimeSlotIdAsc(
                        consultantId, SlotStatus.AVAILABLE, startDate, endDate);

        // ✅ NEW: Filter out any days marked as "Special Booking Days"
        List<LocalDate> specialDays = specialDayRepository.findByConsultantId(consultantId)
                .stream().map(ConsultantSpecialDay::getSpecialDate).toList();

        List<TimeSlot> filteredSlots = slots.stream()
                .filter(slot -> !specialDays.contains(slot.getSlotDate()))
                .toList();

        return mapListToResponse(filteredSlots);
    }

    // --- WORKING DAYS CALCULATION LOGIC ---

    private LocalDate getCurrentWorkingDay(LocalDate date, List<DayOfWeek> offDays) {
        // If today is an off-day, keep rolling forward until we hit a working day.
        while (offDays.contains(date.getDayOfWeek())) {
            date = date.plusDays(1);
        }
        return date;
    }

    private LocalDate getOffsetWorkingDay(LocalDate start, int offsetDays, List<DayOfWeek> offDays) {
        if (offsetDays == 0) return start;
        LocalDate result = start;
        int step = offsetDays > 0 ? 1 : -1;
        int target = Math.abs(offsetDays);
        int added = 0;

        while (added < target) {
            result = result.plusDays(step);
            // Only count the day if it is NOT in the consultant's specific off-days list
            if (!offDays.contains(result.getDayOfWeek())) {
                added++;
            }
        }
        return result;
    }

    // --- MAPPING LOGIC (Prevents N+1 DB Queries) ---

    private TimeSlotResponse mapToResponse(TimeSlot slot) {
        String timeRange = masterTimeSlotRepository.findById(slot.getMasterTimeSlotId())
                .map(MasterTimeSlot::getTimeRange).orElse("Unknown Time");
        return buildResponse(slot, timeRange);
    }

    private List<TimeSlotResponse> mapListToResponse(List<TimeSlot> slots) {
        // Fetch all masters at once to avoid hitting the DB repeatedly in a loop
        Map<Long, String> masterMap = masterTimeSlotRepository.findAll().stream()
                .collect(Collectors.toMap(MasterTimeSlot::getId, MasterTimeSlot::getTimeRange));

        return slots.stream()
                .map(slot -> buildResponse(slot, masterMap.getOrDefault(slot.getMasterTimeSlotId(), "Unknown Time")))
                .toList();
    }

    private TimeSlotResponse buildResponse(TimeSlot slot, String timeRange) {
        return TimeSlotResponse.builder()
                .id(slot.getId())
                .consultantId(slot.getConsultantId())
                .slotDate(slot.getSlotDate())
                .masterTimeSlotId(slot.getMasterTimeSlotId())
                .timeRange(timeRange)
                .durationMinutes(slot.getDurationMinutes())
                .status(slot.getStatus())
                .version(slot.getVersion())
                .build();
    }
}