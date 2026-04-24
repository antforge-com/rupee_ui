package com.rupee.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class FeedbackResponse {
    private Long id;
    private Long userId;
    private Long consultantId;
    private Long meetingId;
    private Long bookingId;
    private Integer rating;
    private String comments;
}