package com.rupee.dto.request;

import com.rupee.enums.TicketEnums.Priority;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TicketRequest {
    @NotNull(message = "User ID is required")
    private Long userId;
    private Long consultantId;
    @NotBlank(message = "Category is required")
    private String category;
    @NotBlank(message = "Description cannot be empty")
    @Size(max = 2000, message = "Description cannot exceed 2000 characters")
    private String description;
    private String attachmentUrl;
    private Priority priority;
}