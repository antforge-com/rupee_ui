package com.rupee.util;

/**
 * Email validation utility class
 * Provides comprehensive email validation.
 */
public class EmailValidator {

    // ✅ ADDED: Private constructor to prevent instantiation
    private EmailValidator() {
        throw new IllegalStateException("Utility class - instantiation is not allowed");
    }

    public static boolean isValidEmail(String email) {
        if (email == null || email.trim().isEmpty()) {
            return false;
        }

        String trimmed = email.trim().toLowerCase();

        if (!trimmed.contains("@") || trimmed.indexOf("@") != trimmed.lastIndexOf("@")) {
            return false;
        }

        String[] parts = trimmed.split("@");
        if (parts.length != 2) {
            return false;
        }

        String localPart = parts[0];
        String domain = parts[1];

        if (localPart.isEmpty() || localPart.length() > 64) {
            return false;
        }

        if (!localPart.matches(".*[a-z].*")) {
            return false;
        }

        if (!localPart.matches("^[a-z0-9].*")) {
            return false;
        }

        if (domain.isEmpty() || !domain.contains(".")) {
            return false;
        }

        if (!domain.matches("^[a-z0-9][a-z0-9.-]*\\.[a-z]{2,}$")) {
            return false;
        }

        String emailRegex = "^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\\.[a-z]{2,}$";
        return trimmed.matches(emailRegex);
    }

    public static void validateEmail(String email) {
        if (!isValidEmail(email)) {
            throw new IllegalArgumentException(
                    "Invalid email format. Please provide a valid email address (e.g., user@example.com)"
            );
        }
    }
}