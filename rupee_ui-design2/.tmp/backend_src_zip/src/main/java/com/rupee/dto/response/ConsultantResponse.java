package com.rupee.dto.response;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.List;

@Data
public class ConsultantResponse {
    private Long id;
    private String name;
    private String email;
    private String designation;
    private BigDecimal charges;

    // ✅ Added @JsonFormat to prevent Jackson Serialization 500 Errors
    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime shiftStartTime;

    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime shiftEndTime;

    private String profilePhoto;
    private String description;
    private Double rating;
    private Double yearsOfExperience;
    private List<String> skills;

    // ✅ NEW
    private Integer slotsDuration;
}