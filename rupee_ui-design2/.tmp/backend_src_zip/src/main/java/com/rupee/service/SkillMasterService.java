package com.rupee.service;

import com.rupee.dto.request.SkillRequest;
import com.rupee.dto.response.SkillResponse;
import com.rupee.entity.SkillMaster;
import com.rupee.repository.SkillMasterRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class SkillMasterService {

    private final SkillMasterRepository skillMasterRepository;

    @Transactional
    public SkillResponse createSkill(SkillRequest request) {
        // ✅ Restore Strategy: Prevent duplicate active skills, but restore soft-deleted ones
        Optional<SkillMaster> existingOpt = skillMasterRepository.findBySkillNameIgnoreCase(request.getSkillName());

        if (existingOpt.isPresent()) {
            SkillMaster existingSkill = existingOpt.get();
            if (existingSkill.isActive()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Skill already exists");
            } else {
                // It was soft-deleted, reactivate it!
                existingSkill.setActive(true);
                SkillMaster restored = skillMasterRepository.save(existingSkill);
                return new SkillResponse(restored.getId(), restored.getSkillName());
            }
        }

        SkillMaster skill = new SkillMaster();
        skill.setSkillName(request.getSkillName());
        skill.setActive(true); // ✅ Set active on creation

        SkillMaster saved = skillMasterRepository.save(skill);
        return new SkillResponse(saved.getId(), saved.getSkillName());
    }

    @Transactional(readOnly = true)
    public List<SkillResponse> getAllSkills() {
        // ✅ Only fetch active skills
        return skillMasterRepository.findByIsActiveTrue().stream()
                .map(s -> new SkillResponse(s.getId(), s.getSkillName()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<String> getAllSkillNames() {
        return skillMasterRepository.findAllSkillNames();
    }

    @Transactional
    public SkillResponse updateSkill(Long id, SkillRequest request) {
        SkillMaster skill = skillMasterRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Skill not found"));

        // Check if they are trying to rename it to a skill that already exists
        if (!skill.getSkillName().equalsIgnoreCase(request.getSkillName().trim()) &&
                skillMasterRepository.existsBySkillNameIgnoreCase(request.getSkillName().trim())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A skill with this name already exists.");
        }

        skill.setSkillName(request.getSkillName().trim());

        SkillMaster updated = skillMasterRepository.save(skill);
        return new SkillResponse(updated.getId(), updated.getSkillName());
    }

    @Transactional
    public void deleteSkill(Long id) {
        SkillMaster skill = skillMasterRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Skill not found"));

        // We no longer delete questions here because Questions are now standalone!

        // Soft-delete the skill itself
        skill.setActive(false);
        skillMasterRepository.save(skill);
    }
}