package com.rupee.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class MasterTimeSlotResponse {
    private Long id;
    private String timeRange;
    private Integer duration;
}