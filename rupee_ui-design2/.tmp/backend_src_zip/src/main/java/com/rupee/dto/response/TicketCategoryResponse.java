package com.rupee.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class TicketCategoryResponse {
    private Long id;
    private String name;
    private String description;
    private boolean isActive;
}