package com.rupee.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {
    private String token;
    private Long userId;
    private String identifier;
    private String role;
    private Long consultantId;
    private boolean requiresPasswordChange; // ADD THIS!
}