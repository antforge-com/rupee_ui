package com.rupee.dto.response;

import lombok.Builder;
import lombok.Data;
import java.util.List;

@Data
@Builder
public class BulkBookingResponse {
    private Long bookingId; // ✅ CHANGED: Now only ONE booking ID is returned!
    private List<Long> timeSlotIds;
    private String message;
}