package com.rupee.dto.response;

import com.rupee.enums.UserEnums.Role;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserResponse {

    private Long id;
    private String identifier;
    private Role role;

    // ✅ Added for Option B linkage
    private Long consultantId;

    // Tells the frontend if the user must change their password
    private boolean requiresPasswordChange;

}