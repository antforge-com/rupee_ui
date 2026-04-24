package com.rupee.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class SmsService {

    // Inject RestTemplate (Ensure you have a @Bean for this in your config)
    private final RestTemplate restTemplate;

    @Value("${sms.dlt.principal-entity-id}")
    private String principalEntityId;

    @Value("${sms.dlt.template-id}")
    private String templateId;

    @Value("${sms.dlt.sender-id}")
    private String senderId;

    @Value("${sms.provider.api-url}")
    private String apiUrl; // e.g., https://control.msg91.com/api/v5/flow/

    @Value("${sms.provider.api-key}")
    private String apiKey;

    public void sendRegistrationSms(String mobileNumber, String otp) {
        // 1. Build the MSG91 JSON Payload
        Map<String, Object> payload = new HashMap<>();
        payload.put("template_id", templateId);
        payload.put("sender", senderId);
        payload.put("short_url", "0"); // Set to "1" if you are sending shortened links

        // Ensure mobile number has the country code (91 for India) as required by MSG91
        String formattedMobile = mobileNumber.startsWith("91") ? mobileNumber : "91" + mobileNumber;
        payload.put("mobiles", formattedMobile);

        // Map your dynamic DLT template variables.
        // If your DLT template is: "Your registration OTP is {#var#}", map it here:
        payload.put("otp", otp);

        // 2. Set the Headers
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("authkey", apiKey); // MSG91 uses 'authkey' in the header

        // 3. Create the HTTP Request Entity
        HttpEntity<Map<String, Object>> requestEntity = new HttpEntity<>(payload, headers);

        // 4. Fire the Request
        try {
            ResponseEntity<String> response = restTemplate.postForEntity(apiUrl, requestEntity, String.class);

            if (response.getStatusCode() == HttpStatus.OK) {
                // ✅ CHANGED to INFO: We need to log the provider's success response ID for billing disputes
                log.info("SMS AUDIT: Dispatch Successful to {}! Provider Response: {}", mobileNumber, response.getBody());
            } else {
                // 🚨 KEPT: Always keep errors so you know if your SMS provider is down
                log.error("SMS ERROR: Failed to send SMS to {}. HTTP Status: {}", mobileNumber, response.getStatusCode());
            }
        } catch (Exception e) {
            // 🚨 KEPT: Network crashes must be logged
            log.error("CRITICAL ERROR: Could not connect to SMS Provider for number {}: {}", mobileNumber, e.getMessage());
            // Depending on your architecture, you might want to throw a custom exception here
        }
    }
}