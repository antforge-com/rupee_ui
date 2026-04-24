package com.rupee.dto.request;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.rupee.util.LocalTimeObjectDeserializer;
import lombok.Data;
import java.time.DayOfWeek;
import java.time.LocalTime;

@Data
public class BusinessHoursRequest {
    private DayOfWeek dayOfWeek;

    // ✅ Routes the complex JSON object through our custom converter
    @JsonDeserialize(using = LocalTimeObjectDeserializer.class)
    private LocalTime startTime;

    // ✅ Routes the complex JSON object through our custom converter
    @JsonDeserialize(using = LocalTimeObjectDeserializer.class)
    private LocalTime endTime;

    private boolean isWorkingDay;
}