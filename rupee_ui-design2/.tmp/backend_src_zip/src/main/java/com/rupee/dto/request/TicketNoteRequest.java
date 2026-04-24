package com.rupee.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor

public class TicketNoteRequest {
    @NotNull(message = "Author ID is required")
    private Long authorId;

    @NotBlank(message = "Note text cannot be empty")
    private String noteText;
}