package com.rupee.dto.response;

import lombok.Builder;
import lombok.Data;
import java.time.DayOfWeek;
import java.time.LocalTime;

@Data
@Builder
public class BusinessHoursResponse {
    private Long id;
    private DayOfWeek dayOfWeek;
    private LocalTime startTime;
    private LocalTime endTime;
    private boolean isWorkingDay;
}