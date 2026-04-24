package com.rupee.dto.request;

import com.rupee.enums.UserEnums.Role;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserRequest {

    @NotBlank(message = "Email or Mobile is required")
    @Pattern(
            regexp = "^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,6}|\\d{10})$",
            message = "Must be a valid email address or a 10-digit mobile number"
    )
    private String identifier;

    @NotBlank(message = "Password is required")
    @Size(min = 6, message = "Password must be at least 6 characters")
    private String password;

    private Role role;

    // ✅ Added for Option B linkage
    private Long consultantId;

}