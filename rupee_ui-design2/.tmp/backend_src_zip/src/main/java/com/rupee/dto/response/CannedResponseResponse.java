package com.rupee.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class CannedResponseResponse {
    private Long id;
    private String title;
    private String content;
    private String category;
    private LocalDateTime createdAt;
}