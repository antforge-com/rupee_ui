package com.rupee.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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
public class FeedbackRequest {

    @NotNull(message = "Consultant ID is required")
    @Min(value = 1, message = "Consultant ID must be valid")
    private Long consultantId;

    @NotNull(message = "Meeting ID is required")
    @Min(value = 1, message = "Meeting ID must be valid")
    private Long meetingId;

    @NotNull(message = "Booking ID is required")
    @Min(value = 1, message = "Booking ID must be valid")
    private Long bookingId;

    @NotNull(message = "Rating is required")
    @Min(value = 1, message = "Rating must be at least 1")
    @Max(value = 5, message = "Rating cannot exceed 5")
    private Integer rating;

    @Size(max = 1000, message = "Comments cannot exceed 1000 characters")
    private String comments;
}