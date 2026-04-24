package com.rupee.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SkillResponse {
    private Long id;
    private String skillName;
    private boolean isActive; // ✅ NEW

    // ✅ Custom constructor to prevent breaking the existing SkillMasterService
    public SkillResponse(Long id, String skillName) {
        this.id = id;
        this.skillName = skillName;
        this.isActive = true; // Defaults to true for existing service calls
    }
}