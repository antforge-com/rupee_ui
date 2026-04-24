package com.rupee.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Data
public class UpdateUserRegistrationRequest {

    // ✅ Optional, but if provided, must be 2-100 chars
    @Size(min = 2, max = 100, message = "Name must be between 2 and 100 characters")
    private String name;

    // ✅ Optional, but if provided, must be in the past
    @Past(message = "Date of Birth must be in the past")
    private LocalDate dob;

    // ✅ Optional, but if provided, must match format
    @Pattern(regexp = "^([A-Z]{5}\\d{4}[A-Z]|\\d{12}|\\d{4}\\s\\d{4}\\s\\d{4})$",
            message = "Invalid format. Must be a valid PAN or 12-digit Aadhar.")
    private String identifier;

    @Size(max = 255, message = "Location cannot exceed 255 characters")
    private String location;

    // Optional, but if provided, must be email format
    @Email(message = "Must be a valid email format")
    private String email;

    // UPDATED: Cannot be empty and must be 10 digits if sent in update
    @NotBlank(message = "Phone number cannot be empty")
    @Pattern(regexp = "^\\d{10}$", message = "Phone number must be exactly 10 digits")
    private String phoneNumber;

    // ADDED: Optional profile image URL or Base64 string for partial updates
    private String profileImageUrl;

    // ADD THESE:
    @Size(max = 100, message = "Designation cannot exceed 100 characters")
    private String designation;

    @Size(max = 100, message = "Organization name cannot exceed 100 characters")
    private String organizationName;

    private Long subscriptionPlanId;

    @JsonProperty("incomeItems")
    @Valid
    private List<IncomeRequest> incomes;

    @JsonProperty("expenseItems")
    @Valid
    private List<ExpenseRequest> expenses;

    @Data
    public static class IncomeRequest {
        @JsonProperty("label")
        private String incomeType;

        @JsonProperty("amount")
        @PositiveOrZero(message = "Income amount cannot be negative")
        private BigDecimal incomeAmount;
    }

    @Data
    public static class ExpenseRequest {
        @JsonProperty("label")
        private String expenseType;

        @JsonProperty("amount")
        @PositiveOrZero(message = "Expense amount cannot be negative")
        private BigDecimal expenseAmount;
    }
}