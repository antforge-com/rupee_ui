package com.rupee.dto.request;

import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import java.time.LocalDate;
import java.util.List;

@Data
public class SpecialDayRequest {
    @NotEmpty(message = "Dates list cannot be empty")
    private List<LocalDate> dates;
}