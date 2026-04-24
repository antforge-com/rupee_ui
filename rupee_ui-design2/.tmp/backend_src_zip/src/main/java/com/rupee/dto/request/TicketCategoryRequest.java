package com.rupee.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TicketCategoryRequest {

    @NotBlank(message = "Category name is required")
    @Size(max = 50, message = "Name must be less than 50 characters")
    private String name;

    @Size(max = 255, message = "Description must be less than 255 characters")
    private String description;
}