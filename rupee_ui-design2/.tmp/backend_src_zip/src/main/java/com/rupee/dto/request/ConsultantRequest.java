package com.rupee.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.List;

@Data
public class ConsultantRequest {

    @NotBlank(message = "Name is required")
    @Size(max = 100, message = "Name cannot exceed 100 characters")
    private String name;

    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    private String email;

    @NotBlank(message = "Designation is required")
    @Size(max = 100, message = "Designation cannot exceed 100 characters")
    private String designation;

    @NotNull(message = "Charges are required")
    @PositiveOrZero(message = "Charges cannot be negative")
    private BigDecimal charges;

    @NotNull(message = "Shift start time is required")
    private LocalTime shiftStartTime;

    @NotNull(message = "Shift end time is required")
    private LocalTime shiftEndTime;

    @Size(max = 2000, message = "Description cannot exceed 2000 characters")
    private String description;

    @NotNull(message = "Years of experience is required")
    @PositiveOrZero(message = "Experience cannot be negative")
    private Double yearsOfExperience;

    @NotEmpty(message = "At least one skill is required")
    private List<@NotBlank(message = "Skill cannot be blank") String> skills;

    // ✅ NEW: Allows setting the duration
    @NotNull(message = "Slot duration is required")
    private Integer slotsDuration;
}