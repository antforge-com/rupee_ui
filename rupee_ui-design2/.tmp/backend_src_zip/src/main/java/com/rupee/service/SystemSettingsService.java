package com.rupee.service;

import com.rupee.dto.request.AutoResponderDto;
import com.rupee.dto.request.BusinessHoursRequest;
import com.rupee.dto.request.FeeConfigRequest;
import com.rupee.dto.request.HolidayRequest;
import com.rupee.dto.response.BusinessHoursResponse;
import com.rupee.dto.response.HolidayResponse;
import com.rupee.entity.BusinessHours;
import com.rupee.entity.Holiday;
import com.rupee.entity.SystemConfig;
import com.rupee.repository.BusinessHoursRepository;
import com.rupee.repository.HolidayRepository;
import com.rupee.repository.SystemConfigRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SystemSettingsService {

    private final BusinessHoursRepository businessHoursRepository;
    private final HolidayRepository holidayRepository;
    private final SystemConfigRepository systemConfigRepository;

    public FeeConfigRequest getFeeSettings() {
        String feeType = systemConfigRepository.findByKey("FEE_TYPE")
                .map(SystemConfig::getValue).orElse("FLAT");
        String feeValue = systemConfigRepository.findByKey("FEE_VALUE")
                .map(SystemConfig::getValue).orElse("0.00");

        FeeConfigRequest response = new FeeConfigRequest();
        response.setFeeType(feeType);
        response.setFeeValue(feeValue);
        return response;
    }

    // ✅ FIXED: Changed to `allEntries = true` to prevent the SpEL crash and safely flush the cache!
    @CacheEvict(value = "systemConfigs", allEntries = true)
    @Transactional
    public FeeConfigRequest updateFeeSettings(FeeConfigRequest request) {
        // Enforce uppercase and validate
        String type = request.getFeeType().toUpperCase();
        if (!type.equals("FLAT") && !type.equals("PERCENTAGE")) {
            throw new IllegalArgumentException("Fee type must be FLAT or PERCENTAGE");
        }

        systemConfigRepository.save(new SystemConfig("FEE_TYPE", type));
        systemConfigRepository.save(new SystemConfig("FEE_VALUE", request.getFeeValue()));

        log.info("Admin updated booking platform fees to {} {}", request.getFeeValue(), type);

        return request;
    }

    // --- BUSINESS HOURS ---

    public List<BusinessHoursResponse> getAllBusinessHours() {
        return businessHoursRepository.findAll().stream()
                .map(this::mapToBusinessHoursResponse)
                .toList();
    }

    @Transactional
    public List<BusinessHoursResponse> updateBusinessHours(List<BusinessHoursRequest> requests) {

        // 1. Fetch all existing hours from DB and put them in a Map keyed by DayOfWeek
        Map<DayOfWeek, BusinessHours> existingHoursMap = businessHoursRepository.findAll().stream()
                .collect(Collectors.toMap(BusinessHours::getDayOfWeek, bh -> bh));

        // 2. Iterate through the incoming requests and update (or create) entities
        List<BusinessHours> hoursToSave = requests.stream().map(req -> {
            // Get the existing record for this day, or create a new one if it doesn't exist
            BusinessHours bh = existingHoursMap.getOrDefault(req.getDayOfWeek(), new BusinessHours());

            bh.setDayOfWeek(req.getDayOfWeek());
            bh.setStartTime(req.getStartTime());
            bh.setEndTime(req.getEndTime());
            bh.setWorkingDay(req.isWorkingDay());

            return bh;
        }).toList();

        // 3. Save all. Hibernate is smart:
        // If 'bh' has an ID, it runs an UPDATE. If it has no ID, it runs an INSERT.
        return businessHoursRepository.saveAll(hoursToSave).stream()
                .map(this::mapToBusinessHoursResponse)
                .toList();
    }

    // --- HOLIDAYS ---

    public List<HolidayResponse> getAllHolidays() {
        return holidayRepository.findAll().stream()
                .map(this::mapToHolidayResponse)
                .toList();
    }

    @Transactional
    public HolidayResponse addHoliday(HolidayRequest request) {
        Holiday holiday = new Holiday();
        holiday.setHolidayDate(request.getHolidayDate());
        holiday.setName(request.getName());

        return mapToHolidayResponse(holidayRepository.save(holiday));
    }

    @Transactional
    public void deleteHoliday(Long id) {
        holidayRepository.deleteById(id);
    }

    // --- AUTO RESPONDER CONFIG ---

    public AutoResponderDto getAutoResponderSettings() {
        boolean enabled = Boolean.parseBoolean(systemConfigRepository.findByKey("AUTO_RESPONDER_ENABLED")
                .map(SystemConfig::getValue).orElse("false"));
        String message = systemConfigRepository.findByKey("AUTO_RESPONDER_MESSAGE")
                .map(SystemConfig::getValue).orElse("Thank you for reaching out! We will review your ticket shortly.");

        return new AutoResponderDto(enabled, message);
    }

    // ✅ FIXED: Added CacheEvict so the TicketService actually sees the new Auto-Responder message!
    @CacheEvict(value = "systemConfigs", allEntries = true)
    @Transactional
    public AutoResponderDto updateAutoResponderSettings(AutoResponderDto request) {
        systemConfigRepository.save(new SystemConfig("AUTO_RESPONDER_ENABLED", String.valueOf(request.isEnabled())));

        if (request.getMessage() != null && !request.getMessage().trim().isEmpty()) {
            systemConfigRepository.save(new SystemConfig("AUTO_RESPONDER_MESSAGE", request.getMessage()));
        }

        log.info("Admin updated Auto-Responder settings. Enabled: {}", request.isEnabled());
        return getAutoResponderSettings();
    }

    // --- MAPPERS ---

    private BusinessHoursResponse mapToBusinessHoursResponse(BusinessHours bh) {
        return BusinessHoursResponse.builder()
                .id(bh.getId())
                .dayOfWeek(bh.getDayOfWeek())
                .startTime(bh.getStartTime())
                .endTime(bh.getEndTime())
                .isWorkingDay(bh.isWorkingDay())
                .build();
    }

    private HolidayResponse mapToHolidayResponse(Holiday holiday) {
        return HolidayResponse.builder()
                .id(holiday.getId())
                .holidayDate(holiday.getHolidayDate())
                .name(holiday.getName())
                .build();
    }
}