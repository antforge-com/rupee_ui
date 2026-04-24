package com.rupee.dto.request;

import lombok.Data;
import java.time.LocalDate;

@Data
public class HolidayRequest {
    private LocalDate holidayDate;
    private String name;
}