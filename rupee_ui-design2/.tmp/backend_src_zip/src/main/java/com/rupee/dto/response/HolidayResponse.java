package com.rupee.dto.response;

import lombok.Builder;
import lombok.Data;
import java.time.LocalDate;

@Data
@Builder
public class HolidayResponse {
    private Long id;
    private LocalDate holidayDate;
    private String name;
}