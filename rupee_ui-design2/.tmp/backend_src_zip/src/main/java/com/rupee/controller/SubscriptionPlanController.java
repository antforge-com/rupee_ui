package com.rupee.controller;

import com.rupee.dto.request.SubscriptionPlanRequest;
import com.rupee.dto.response.SubscriptionPlanResponse;
import com.rupee.service.SubscriptionPlanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/subscription-plans")
@RequiredArgsConstructor
public class SubscriptionPlanController {

    private final SubscriptionPlanService subscriptionPlanService;

    // Publicly accessible for the frontend to populate the pricing cards
    @GetMapping
    public ResponseEntity<List<SubscriptionPlanResponse>> getAllPlans() {
        return ResponseEntity.ok(subscriptionPlanService.getAllPlans());
    }

    // Admin routes
    @PostMapping
    public ResponseEntity<SubscriptionPlanResponse> createPlan(@Valid @RequestBody SubscriptionPlanRequest request) {
        return new ResponseEntity<>(subscriptionPlanService.createPlan(request), HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public ResponseEntity<SubscriptionPlanResponse> updatePlan(@PathVariable Long id, @Valid @RequestBody SubscriptionPlanRequest request) {
        return ResponseEntity.ok(subscriptionPlanService.updatePlan(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deletePlan(@PathVariable Long id) {
        subscriptionPlanService.deletePlan(id);
        return ResponseEntity.noContent().build();
    }
}