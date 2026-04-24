package com.rupee.service;

import com.rupee.dto.request.ConsultantRequest;
import com.rupee.dto.response.ConsultantResponse;
import com.rupee.entity.*;
import com.rupee.enums.SpecialBookingStatus;
import com.rupee.enums.TimeSlotEnums.*;
import com.rupee.enums.UserEnums.Role;
import com.rupee.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Slf4j
@Service
@RequiredArgsConstructor
public class ConsultantService {

    private final ConsultantRepository consultantRepository;
    private final ConsultantSkillRepository consultantSkillRepository;
    private final SkillMasterRepository skillMasterRepository;
    private final TimeSlotRepository timeSlotRepository;
    private final MasterTimeSlotRepository masterTimeSlotRepository;
    private final BookingRepository bookingRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final S3StorageService s3StorageService;
    private final EmailService emailService;
    private final ConsultantSpecialDayRepository specialDayRepository; // ✅ ADDED
    private final SpecialBookingRepository specialBookingRepository; // ✅ ADD THIS INJECTION

    // --- CONSTANTS ---
    private static final String CONSULTANT_NOT_FOUND_MSG = "Consultant not found";

    @Transactional(readOnly = true)
    public List<ConsultantResponse> getAllConsultants() {
        return consultantRepository.findAll().stream().map(consultant -> {
            List<String> skills = consultantSkillRepository.findByConsultantId(consultant.getId())
                    .stream().map(ConsultantSkill::getSkillName).toList();
            String email = userRepository.findByConsultantId(consultant.getId())
                    .map(User::getIdentifier).orElse(null);
            ConsultantResponse response = mapToResponse(consultant, skills);
            response.setEmail(email);
            return response;
        }).toList();
    }

    // == TIME SLOTS ==

    // ✅ NEW METHOD: Fetch only master slots that fit within the consultant's shift
    @Transactional(readOnly = true)
    public List<MasterTimeSlot> getMasterTimeSlotsByConsultant(Long consultantId) {
        Consultant consultant = consultantRepository.findById(consultantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, CONSULTANT_NOT_FOUND_MSG));

        LocalTime shiftStart = consultant.getShiftStartTime();
        LocalTime shiftEnd = consultant.getShiftEndTime();

        List<MasterTimeSlot> allMasterSlots = masterTimeSlotRepository.findAll();
        List<MasterTimeSlot> applicableSlots = new ArrayList<>();

        for (MasterTimeSlot slot : allMasterSlots) {
            // ✅ NEW: Filter by duration AND shift timing
            if (slot.getDuration().equals(consultant.getSlotsDuration()) && isSlotWithinShift(slot.getTimeRange(), shiftStart, shiftEnd)) {
                applicableSlots.add(slot);
            }
        }
        return applicableSlots;
    }

    // == CREATE ==
    @Transactional
    public ConsultantResponse createConsultant(ConsultantRequest request, MultipartFile file) {
        if (consultantRepository.existsByNameIgnoreCaseAndDesignationIgnoreCase(request.getName(), request.getDesignation())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A consultant with this exact name and designation already exists.");
        }

        Consultant consultant = new Consultant();
        consultant.setName(request.getName());
        consultant.setDesignation(request.getDesignation());
        consultant.setCharges(request.getCharges());
        consultant.setShiftStartTime(request.getShiftStartTime());
        consultant.setShiftEndTime(request.getShiftEndTime());
        consultant.setDescription(request.getDescription());
        consultant.setYearsOfExperience(request.getYearsOfExperience());

        // ✅ NEW: Initial Duration Logic
        consultant.setSlotsDuration(request.getSlotsDuration());
        consultant.setLastDurationUpdate(LocalDate.now());

        if (file != null && !file.isEmpty()) {
            consultant.setProfilePhoto(s3StorageService.uploadFile(file, "consultants"));
        }

        Consultant savedConsultant = consultantRepository.save(consultant);

        String email = request.getEmail();
        String generatedPassword = email.contains("@") ? email.substring(0, email.indexOf('@')) : email;

        User user = new User();
        user.setIdentifier(email);

        // ✅ ENCRYPTING THE PASSWORD!
        user.setPassword(passwordEncoder.encode(generatedPassword));
        user.setRole(Role.CONSULTANT);
        user.setConsultantId(savedConsultant.getId());
        userRepository.save(user);

        // ==========================================
        // ✅ 2. ADD THIS: Send Welcome Credentials
        // ==========================================
        try {
            // Template already tells them to reset their password on first login
            emailService.sendWelcomeCredentials(email, request.getName(), generatedPassword);
            // Note: Success log intentionally omitted to save EC2 t3.micro disk I/O
        } catch (Exception e) {
            // 🚨 KEEP THIS: If AWS SES/Gmail crashes, your EC2 instance will log the failure!
            log.error("Failed to send welcome credentials to consultant {}", email, e);
        }
        // ==========================================

        saveSkills(savedConsultant.getId(), request.getSkills());

        ConsultantResponse response = mapToResponse(savedConsultant, request.getSkills());
        response.setEmail(email);
        return response;
    }

    @Transactional(readOnly = true)
    public ConsultantResponse getConsultantById(Long id) {
        Consultant consultant = consultantRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, CONSULTANT_NOT_FOUND_MSG));
        List<String> skills = consultantSkillRepository.findByConsultantId(id)
                .stream().map(ConsultantSkill::getSkillName).toList();
        String email = userRepository.findByConsultantId(id)
                .map(User::getIdentifier).orElse(null);
        ConsultantResponse response = mapToResponse(consultant, skills);
        response.setEmail(email);
        return response;
    }

    // == UPDATE ==
    @Transactional
    public ConsultantResponse updateConsultant(Long id, ConsultantRequest request, MultipartFile file) {
        Consultant consultant = consultantRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, CONSULTANT_NOT_FOUND_MSG));

        if (consultantRepository.existsByNameIgnoreCaseAndDesignationIgnoreCaseAndIdNot(request.getName(), request.getDesignation(), id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Another consultant with this exact name exists.");
        }

        // ✅ NEW: Smart Monthly Duration Lock Logic
        if (!consultant.getSlotsDuration().equals(request.getSlotsDuration())) {
            LocalDate now = LocalDate.now();
            YearMonth currentMonth = YearMonth.from(now);

            if (consultant.getLastDurationUpdate() != null) {
                YearMonth lastUpdateMonth = YearMonth.from(consultant.getLastDurationUpdate());
                if (currentMonth.equals(lastUpdateMonth)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Slot duration can only be changed once per month.");
                }
            }
            consultant.setSlotsDuration(request.getSlotsDuration());
            consultant.setLastDurationUpdate(now);
        }

        consultant.setName(request.getName());
        consultant.setDesignation(request.getDesignation());
        consultant.setYearsOfExperience(request.getYearsOfExperience());
        consultant.setCharges(request.getCharges());
        consultant.setShiftStartTime(request.getShiftStartTime());
        consultant.setShiftEndTime(request.getShiftEndTime());
        consultant.setDescription(request.getDescription());

        if (file != null && !file.isEmpty()) {
            s3StorageService.deleteFile(consultant.getProfilePhoto());
            consultant.setProfilePhoto(s3StorageService.uploadFile(file, "consultants"));
        }

        Consultant updatedConsultant = consultantRepository.save(consultant);

        consultantSkillRepository.deleteAllByConsultantId(id);
        saveSkills(id, request.getSkills());

        String email = userRepository.findByConsultantId(id)
                .map(User::getIdentifier).orElse(null);

        ConsultantResponse response = mapToResponse(updatedConsultant, request.getSkills());
        response.setEmail(email);
        return response;
    }

    // == DELETE ==
    @Transactional
    public void deleteConsultant(Long id) {
        Consultant consultant = consultantRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, CONSULTANT_NOT_FOUND_MSG));

        if (bookingRepository.existsByConsultantId(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot delete consultant: Bookings exist.");
        }
        s3StorageService.deleteFile(consultant.getProfilePhoto());
        consultantSkillRepository.deleteAllByConsultantId(id);
        timeSlotRepository.deleteAllByConsultantId(id);
        userRepository.deleteByConsultantId(id);
        specialDayRepository.findByConsultantId(id).forEach(specialDayRepository::delete);
        consultantRepository.deleteById(id);
    }

    // ==========================================
    // ✅ NEW: SPECIAL DAYS LOGIC (WITH VALIDATION)
    // ==========================================
    @Transactional
    public void setSpecialDays(Long consultantId, List<LocalDate> dates) {
        if (!consultantRepository.existsById(consultantId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, CONSULTANT_NOT_FOUND_MSG);
        }

        for (LocalDate date : dates) {
            // 🚨 RULE: Cannot switch to Special Day if Normal Bookings already exist!
            if (timeSlotRepository.existsByConsultantIdAndSlotDateAndStatus(consultantId, date, SlotStatus.BOOKED)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Cannot mark " + date + " as a Special Day. There are already normal bookings scheduled.");
            }

            if (!specialDayRepository.existsByConsultantIdAndSpecialDate(consultantId, date)) {
                // ✅ CLEAN BUILDER PATTERN (No nulls, no manual timestamps!)
                specialDayRepository.save(
                        ConsultantSpecialDay.builder()
                                .consultantId(consultantId)
                                .specialDate(date)
                                .build()
                );
            }
        }
    }

    @Transactional
    public void removeSpecialDay(Long consultantId, LocalDate date) {
        // 🚨 RULE: Cannot switch back to Normal Day if Special Bookings already exist!
        if (specialBookingRepository.existsByConsultantIdAndScheduledDateAndStatus(
                consultantId, date, SpecialBookingStatus.CONFIRMED)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot remove Special Day status for " + date + ". There are already Special Bookings scheduled on this date.");
        }

        specialDayRepository.deleteByConsultantIdAndSpecialDate(consultantId, date);
    }

    @Transactional(readOnly = true)
    public List<LocalDate> getSpecialDays(Long consultantId) {
        return specialDayRepository.findByConsultantId(consultantId).stream()
                .map(ConsultantSpecialDay::getSpecialDate).toList();
    }

    // == OTHER UTILITIES ==

    // ✅ TIME MATH UTILITIES ADDED HERE
    private boolean isSlotWithinShift(String slotRange, LocalTime shiftStart, LocalTime shiftEnd) {
        try {
            String[] slotParts = slotRange.split("-");
            if (slotParts.length != 2) return false;

            LocalTime slotStart = parseTime(slotParts[0].trim());
            LocalTime slotEnd = parseTime(slotParts[1].trim());

            // Convert to minutes from Midnight to easily handle overnight shifts (e.g., 3 PM to 12 AM)
            int shiftStartMins = shiftStart.getHour() * 60 + shiftStart.getMinute();
            int shiftEndMins = shiftEnd.getHour() * 60 + shiftEnd.getMinute();
            if (shiftEndMins <= shiftStartMins) {
                shiftEndMins += 24 * 60; // Represents the next day
            }

            int slotStartMins = slotStart.getHour() * 60 + slotStart.getMinute();
            int slotEndMins = slotEnd.getHour() * 60 + slotEnd.getMinute();
            if (slotEndMins <= slotStartMins) {
                slotEndMins += 24 * 60; // Represents the next day
            }

            // Valid if the slot begins on/after the shift start, AND finishes on/before the shift end
            return slotStartMins >= shiftStartMins && slotEndMins <= shiftEndMins;
        } catch (Exception e) {
            throw new IllegalArgumentException("Time parsing error. Cannot map Slot: " + slotRange, e);
        }
    }

    private LocalTime parseTime(String timeStr) {
        // This safely parses formats like "3:00 PM", "03:00 PM", "12:00 AM"
        DateTimeFormatter formatter = new DateTimeFormatterBuilder()
                .parseCaseInsensitive()
                .appendPattern("h:mm a")
                .toFormatter(Locale.ENGLISH);
        return LocalTime.parse(timeStr.toUpperCase(), formatter);
    }

    // ==========================================
    // ✅ UTILITY: Capitalize First Letter of Every Word
    // ==========================================
    private String formatSkillName(String skillName) {
        if (skillName == null || skillName.trim().isEmpty()) return skillName;
        String[] words = skillName.trim().split("\\s+");
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

    private void saveSkills(Long consultantId, List<String> skillNames) {
        if (skillNames == null) return;
        List<ConsultantSkill> skillsToSave = new ArrayList<>();

        for (String skillName : skillNames) {
            if (skillName.trim().isEmpty()) continue;

            // ✅ Formats "tax planning" to "Tax Planning"
            String cleanSkill = formatSkillName(skillName);

            // ✅ Fetch the skill to safely check its current status
            var existingSkillOpt = skillMasterRepository.findBySkillNameIgnoreCase(cleanSkill);

            if (existingSkillOpt.isEmpty()) {
                // 1. Skill doesn't exist at all -> Create a brand new active skill
                SkillMaster sm = new SkillMaster();
                sm.setSkillName(cleanSkill);
                sm.setActive(true); // Ensure it is active
                skillMasterRepository.save(sm);
            } else {
                // 2. Skill exists -> Check if an admin had previously soft-deleted it
                SkillMaster existingSkill = existingSkillOpt.get();
                if (!existingSkill.isActive()) {
                    existingSkill.setActive(true); // Reactivate the hidden skill!
                    skillMasterRepository.save(existingSkill);
                }
            }

            // 3. Link the skill to the Consultant
            ConsultantSkill skill = new ConsultantSkill();
            skill.setConsultantId(consultantId);
            skill.setSkillName(cleanSkill);
            skillsToSave.add(skill);
        }

        // Save all linked skills in one batch
        consultantSkillRepository.saveAll(skillsToSave);
    }

    private ConsultantResponse mapToResponse(Consultant consultant, List<String> skills) {
        ConsultantResponse response = new ConsultantResponse();
        response.setId(consultant.getId());
        response.setName(consultant.getName());
        response.setDesignation(consultant.getDesignation());
        response.setCharges(consultant.getCharges());
        response.setShiftStartTime(consultant.getShiftStartTime());
        response.setShiftEndTime(consultant.getShiftEndTime());
        response.setProfilePhoto(consultant.getProfilePhoto());
        response.setDescription(consultant.getDescription());
        response.setRating(consultant.getRating());
        response.setYearsOfExperience(consultant.getYearsOfExperience());
        response.setSlotsDuration(consultant.getSlotsDuration()); // ✅
        response.setSkills(skills != null ? skills : new ArrayList<>());
        return response;
    }
}