package com.rupee.service;

import com.rupee.dto.request.MasterTimeSlotRequest;
import com.rupee.dto.response.MasterTimeSlotResponse;
import com.rupee.entity.MasterTimeSlot;
import com.rupee.repository.MasterTimeSlotRepository;
import com.rupee.repository.TimeSlotRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class MasterTimeSlotService {

    private final MasterTimeSlotRepository masterTimeSlotRepository;
    private final TimeSlotRepository timeSlotRepository;

    @Transactional(readOnly = true)
    public Page<MasterTimeSlotResponse> getAllMasterSlots(Pageable pageable) {
        return masterTimeSlotRepository.findAll(pageable)
                .map(slot -> MasterTimeSlotResponse.builder()
                        .id(slot.getId())
                        .timeRange(slot.getTimeRange())
                        .duration(slot.getDuration()) // ✅ Mapped
                        .build());
    }

    @Transactional
    public MasterTimeSlotResponse createMasterSlot(MasterTimeSlotRequest request) {
        if (masterTimeSlotRepository.existsByTimeRangeIgnoreCase(request.getTimeRange())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This time range already exists.");
        }

        MasterTimeSlot slot = new MasterTimeSlot();
        slot.setTimeRange(request.getTimeRange());
        slot.setDuration(request.getDuration()); // ✅
        MasterTimeSlot saved = masterTimeSlotRepository.save(slot);

        return MasterTimeSlotResponse.builder()
                .id(saved.getId())
                .timeRange(saved.getTimeRange())
                .duration(saved.getDuration()) // ✅
                .build();
    }

    @Transactional
    public MasterTimeSlotResponse updateMasterSlot(Long id, MasterTimeSlotRequest request) {
        MasterTimeSlot slot = masterTimeSlotRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Master slot not found"));

        // Check if updating to a string that already exists elsewhere
        if (!slot.getTimeRange().equalsIgnoreCase(request.getTimeRange()) &&
                masterTimeSlotRepository.existsByTimeRangeIgnoreCase(request.getTimeRange())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This time range already exists.");
        }

        slot.setTimeRange(request.getTimeRange());
        slot.setDuration(request.getDuration()); // ✅
        MasterTimeSlot updated = masterTimeSlotRepository.save(slot);

        return MasterTimeSlotResponse.builder()
                .id(updated.getId())
                .timeRange(updated.getTimeRange())
                .duration(updated.getDuration()) // ✅
                .build();
    }

    @Transactional
    public void deleteMasterSlot(Long id) {
        if (!masterTimeSlotRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Master slot not found");
        }

        // 🚨 SAFETY CHECK: Don't delete if it's assigned to a consultant's calendar!
        if (timeSlotRepository.existsByMasterTimeSlotId(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot delete: This time slot is currently being used by consultants.");
        }
        masterTimeSlotRepository.deleteById(id);
    }
}