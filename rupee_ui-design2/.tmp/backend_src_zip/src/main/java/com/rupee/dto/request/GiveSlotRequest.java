package com.rupee.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalTime;

@Data
public class GiveSlotRequest {
    @NotNull(message = "Date is required")
    private LocalDate date;

    @NotNull(message = "Start Time is required")
    private LocalTime startTime;

    @NotNull(message = "Meeting Link is required")
    private String meetingLink;

    @NotNull(message = "Meeting ID is required")
    private String meetingId;
}