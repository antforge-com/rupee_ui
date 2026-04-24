package com.rupee.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CannedResponseRequest {

    @NotBlank(message = "Title is required")
    @Size(max = 100, message = "Title must be less than 100 characters")
    private String title;

    @NotBlank(message = "Content is required")
    @Size(max = 2000, message = "Content must be less than 2000 characters")
    private String content;

    private String category; // Optional filter
}