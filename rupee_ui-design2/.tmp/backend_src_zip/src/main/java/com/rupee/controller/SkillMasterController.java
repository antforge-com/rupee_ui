package com.rupee.controller;

import com.rupee.dto.request.SkillRequest;
import com.rupee.dto.response.SkillResponse;
import com.rupee.service.SkillMasterService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/skills")
@RequiredArgsConstructor
public class SkillMasterController {

    private final SkillMasterService skillMasterService;

    // Admin clicks "Create Skill" (Will restore the skill if it was previously soft-deleted)
    @PostMapping
    public ResponseEntity<SkillResponse> createSkill(@Valid @RequestBody SkillRequest request) {
        return ResponseEntity.ok(skillMasterService.createSkill(request));
    }

    // Frontend loads the list of strictly ACTIVE skills on the left side of the screen
    @GetMapping
    public ResponseEntity<List<SkillResponse>> getAllSkills() {
        return ResponseEntity.ok(skillMasterService.getAllSkills());
    }

    // ADMIN: Update an existing skill
    @PutMapping("/{id:[0-9]+}")
    public ResponseEntity<SkillResponse> updateSkill(
            @PathVariable Long id,
            @Valid @RequestBody SkillRequest request) {
        return ResponseEntity.ok(skillMasterService.updateSkill(id, request));
    }

    // ADMIN: Soft delete a skill (Cascades down to soft-delete Questions and Answers)
    @DeleteMapping("/{id:[0-9]+}")
    public ResponseEntity<Void> deleteSkill(@PathVariable Long id) {
        skillMasterService.deleteSkill(id);
        return ResponseEntity.noContent().build();
    }
}