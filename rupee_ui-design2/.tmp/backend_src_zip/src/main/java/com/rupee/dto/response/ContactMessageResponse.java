package com.rupee.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ContactMessageResponse {
    private Long id;
    private String name;
    private String email;
    private String message;
    private boolean isRead;
    private LocalDateTime createdAt;
}