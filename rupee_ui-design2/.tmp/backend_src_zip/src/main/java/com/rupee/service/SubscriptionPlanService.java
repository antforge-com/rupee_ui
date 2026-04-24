package com.rupee.service;

import com.rupee.dto.request.SubscriptionPlanRequest;
import com.rupee.dto.response.SubscriptionPlanResponse;
import com.rupee.entity.SubscriptionPlan;
import com.rupee.repository.SubscriptionPlanRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@RequiredArgsConstructor
public class SubscriptionPlanService {

    private final SubscriptionPlanRepository subscriptionPlanRepository;

    @Transactional(readOnly = true)
    public List<SubscriptionPlanResponse> getAllPlans() {
        return subscriptionPlanRepository.findAll().stream()
                .map(this::mapToResponse)
                .toList();
    }

    @Transactional
    public SubscriptionPlanResponse createPlan(SubscriptionPlanRequest request) {
        if (subscriptionPlanRepository.existsByNameIgnoreCase(request.getName())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A plan with this name already exists.");
        }

        SubscriptionPlan plan = SubscriptionPlan.builder()
                .name(request.getName())
                .originalPrice(request.getOriginalPrice())
                .discountPrice(request.getDiscountPrice())
                .features(request.getFeatures())
                .tag(request.getTag())
                .build();

        return mapToResponse(subscriptionPlanRepository.save(plan));
    }

    @Transactional
    public SubscriptionPlanResponse updatePlan(Long id, SubscriptionPlanRequest request) {
        SubscriptionPlan plan = subscriptionPlanRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Plan not found"));

        if (subscriptionPlanRepository.existsByNameIgnoreCaseAndIdNot(request.getName(), id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Another plan with this name already exists.");
        }

        plan.setName(request.getName());
        plan.setOriginalPrice(request.getOriginalPrice());
        plan.setDiscountPrice(request.getDiscountPrice());
        plan.setFeatures(request.getFeatures());
        plan.setTag(request.getTag());

        return mapToResponse(subscriptionPlanRepository.save(plan));
    }

    @Transactional
    public void deletePlan(Long id) {
        if (!subscriptionPlanRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Plan not found");
        }

        // Note: You might want to prevent deletion if users are actively subscribed to it!
        subscriptionPlanRepository.deleteById(id);
    }

    private SubscriptionPlanResponse mapToResponse(SubscriptionPlan plan) {
        return SubscriptionPlanResponse.builder()
                .id(plan.getId())
                .name(plan.getName())
                .originalPrice(plan.getOriginalPrice())
                .discountPrice(plan.getDiscountPrice())
                .features(plan.getFeatures())
                .tag(plan.getTag())
                .build();
    }
}