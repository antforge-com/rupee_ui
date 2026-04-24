package com.rupee.dto.response;

import lombok.Builder;
import lombok.Data;
import java.math.BigDecimal;

@Data
@Builder
public class SubscriptionPlanResponse {
    private Long id;
    private String name;
    private BigDecimal originalPrice;
    private BigDecimal discountPrice;
    private String features;
    private String tag;
}