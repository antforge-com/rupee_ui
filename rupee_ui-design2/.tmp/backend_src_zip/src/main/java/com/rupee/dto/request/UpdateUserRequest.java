package com.rupee.dto.request;

import com.rupee.enums.UserEnums.Role;
import lombok.Data;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Data
public class UpdateUserRequest {

    // ✅ No @NotBlank. It is now optional.
    @Pattern(
            regexp = "^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,6}|\\d{10})$",
            message = "Must be a valid email address or a 10-digit mobile number"
    )
    private String identifier;

    // ✅ No @NotBlank. It is now optional.
    @Size(min = 6, message = "Password must be at least 6 characters")
    private String password;

    private Role role;

    private Long consultantId;
}