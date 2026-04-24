package com.rupee.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import jakarta.mail.internet.MimeMessage;

@Slf4j
@Async
@Service
public class EmailService {

    private final JavaMailSender javaMailSender;
    private final String senderEmail;
    private final String frontendUrl; // ✅ ADDED: Frontend URL for button redirects

    // ✅ SONARQUBE FIX: Defined all constants to prevent magic strings and typos
    private static final String TICKET_ID_PLACEHOLDER = "{ticketId}";
    private static final String BOOKING_ID_PLACEHOLDER = "{bookingId}";
    private static final String MEETING_MODE_PLACEHOLDER = "{meetingMode}";
    private static final String HOURS_PLACEHOLDER = "{hours}";
    private static final String CLIENT_EMAIL_PLACEHOLDER = "{clientEmail}";
    private static final String CONSULTANT_EMAIL_PLACEHOLDER = "{consultantEmail}";
    private static final String DATE_PLACEHOLDER = "{date}";
    private static final String TIME_PLACEHOLDER = "{time}";
    private static final String UNKNOWN_FALLBACK = "Unknown";
    private static final String PENDING_LINK_TEXT = "Link will be provided later";

    // Constants to prevent duplication of dynamic footer tags
    private static final String DYNAMIC_USER_FOOTER = "{dynamicFooterPlaceholder}";
    private static final String DYNAMIC_CONSULTANT_FOOTER = "{dynamicConsultantFooter}";
    private static final String ACTION_BUTTON_PLACEHOLDER = "{actionButton}"; // ✅ ADDED
    private static final String END_DIVS = "</div></div>";
    private static final String VIEW_SCHEDULE_TEXT = "View Schedule";

    public EmailService(JavaMailSender javaMailSender,
                        @Value("${spring.mail.username}") String senderEmail,
                        @Value("${app.frontend.url:http://localhost:3000}") String frontendUrl) {
        this.javaMailSender = javaMailSender;
        this.senderEmail = senderEmail;
        this.frontendUrl = frontendUrl; // ✅ ADDED
    }

    // DTO record to group parameters and resolve the "More than 7 parameters" issue
    public record SpecialBookingEmailData(
            Long bookingId,
            String date,
            String time,
            int hours,
            String meetingMode,
            String meetingLink,
            String otherPartyEmail
    ) {}

    // ==========================================
    // 🎨 HELPER: GENERATE HTML BUTTON
    // ==========================================
    private String getActionButton(String url, String buttonText) {
        return "<div style='text-align: center; margin-top: 25px; margin-bottom: 10px;'>" +
                "<a href='" + url + "' style='background-color: #0F766E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px; letter-spacing: 0.5px; box-shadow: 0 4px 6px rgba(15, 118, 110, 0.2);'>" +
                buttonText + "</a></div>";
    }

    // ==========================================
    // 🎨 EMAIL HTML TEMPLATES
    // ==========================================

    private static final String REGISTRATION_SUBJECT = "Verify your email address - Meet the Masters";

    // --- AUTH TEMPLATES ---
    // 🎨 Template: OTP for Registration / Verification
    private static final String REGISTRATION_OTP_BODY =
            "<div style='font-family: \"Plus Jakarta Sans\", Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;'>" +
                    "<div style='background-color: #1d4ed8; color: white; padding: 25px; text-align: center;'>" +
                    "<h1 style='margin: 0; font-size: 24px; letter-spacing: 1px;'>MEET THE MASTERS</h1>" +
                    "</div>" +
                    "<div style='padding: 30px; background-color: #ffffff;'>" +
                    "<h2 style='color: #1e293b; margin-top: 0;'>Verify Your Email, {firstName}</h2>" +
                    "<p style='color: #475569; font-size: 16px; line-height: 1.5;'>Thank you for registering. To complete your account setup, please use the verification code below:</p>" +
                    "<div style='background-color: #f8fafc; border: 2px dashed #1d4ed8; border-radius: 8px; padding: 25px; text-align: center; margin: 30px 0;'>" +
                    "<p style='font-size: 36px; font-weight: bold; color: #1d4ed8; letter-spacing: 8px; margin: 0;'>{otpValue}</p>" +
                    "</div>" +
                    "<p style='color: #475569; font-size: 14px;'><strong>⏱️ This code is valid for 10 minutes.</strong></p>" +
                    "<p style='color: #475569; font-size: 14px;'>If you did not request this registration, please ignore this email.</p>" +
                    "</div>" +
                    "<div style='background-color: #f1f5f9; color: #64748b; padding: 20px; text-align: center; font-size: 12px;'>" +
                    "<p style='margin: 0 0 5px 0;'>© 2026 Meet the Masters. All rights reserved.</p>" +
                    "<p style='margin: 0;'>This is an automated message, please do not reply.</p>" +
                    "</div>" +
                    "</div>";

    // 🎨 Template: Welcome Credentials
    private static final String WELCOME_CREDENTIALS_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #1d4ed8; color: white; padding: 20px; text-align: center;'><h1>Welcome to Meet the Masters!</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>Hello {name},</p>" +
                    "<p>Your account has been successfully created. Here are your login credentials:</p>" +
                    "<div style='background-color: #f8fafc; padding: 15px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #1d4ed8;'>" +
                    "<p><strong>Email/Username:</strong> {email}</p>" +
                    "<p><strong>Temporary Password:</strong> {password}</p>" +
                    "</div>" +
                    "<p style='color: #ef4444;'><strong>Important:</strong> You will be required to change this temporary password during your first login.</p>" +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    // --- BOOKING TEMPLATES ---
    // 🎨 Template: Booking Confirmation (For the User)
    private static final String BOOKING_USER_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #10b981; color: white; padding: 20px; text-align: center;'><h1>Booking Confirmed!</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>Your session has been successfully booked.</p>" +
                    "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li><strong>Booking ID:</strong> #" + BOOKING_ID_PLACEHOLDER + "</li>" +
                    "<li><strong>Meeting Mode:</strong> " + MEETING_MODE_PLACEHOLDER + "</li>" +
                    "<li><strong>Discount Applied:</strong> ₹{discountAmount}</li>" +
                    "<li><strong>Amount Paid:</strong> ₹{amount}</li>" +
                    "</ul>" +
                    DYNAMIC_USER_FOOTER +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    // 🎨 Template: New Booking Alert (For the Consultant)
    private static final String BOOKING_CONSULTANT_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #f59e0b; color: white; padding: 20px; text-align: center;'><h1>New Appointment Alert</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>You have a new booking scheduled!</p>" +
                    "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li><strong>Booking ID:</strong> #" + BOOKING_ID_PLACEHOLDER + "</li>" +
                    "<li><strong>Client Email:</strong> " + CLIENT_EMAIL_PLACEHOLDER + "</li>" +
                    "<li><strong>Meeting Mode:</strong> " + MEETING_MODE_PLACEHOLDER + "</li>" +
                    "</ul>" +
                    DYNAMIC_CONSULTANT_FOOTER +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    // 🎨 NEW Template: Normal Booking Rescheduled (For the User)
    private static final String NORMAL_BOOKING_RESCHEDULED_USER_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #3b82f6; color: white; padding: 20px; text-align: center;'><h1>Booking Rescheduled</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>Your session has been successfully rescheduled to a new time slot.</p>" +
                    "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li><strong>Booking ID:</strong> #" + BOOKING_ID_PLACEHOLDER + "</li>" +
                    "<li><strong>Meeting Mode:</strong> " + MEETING_MODE_PLACEHOLDER + "</li>" +
                    "</ul>" +
                    DYNAMIC_USER_FOOTER +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    // 🎨 NEW Template: Normal Booking Rescheduled (For the Consultant)
    private static final String NORMAL_BOOKING_RESCHEDULED_CONSULTANT_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #f59e0b; color: white; padding: 20px; text-align: center;'><h1>Appointment Rescheduled</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>An existing booking has been rescheduled to a new time slot.</p>" +
                    "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li><strong>Booking ID:</strong> #" + BOOKING_ID_PLACEHOLDER + "</li>" +
                    "<li><strong>Client Email:</strong> " + CLIENT_EMAIL_PLACEHOLDER + "</li>" +
                    "<li><strong>Meeting Mode:</strong> " + MEETING_MODE_PLACEHOLDER + "</li>" +
                    "</ul>" +
                    DYNAMIC_CONSULTANT_FOOTER +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    // 🎨 NEW Template: Booking Cancellation (For the User)
    private static final String BOOKING_CANCELLED_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #ef4444; color: white; padding: 20px; text-align: center;'><h1>Booking Cancelled</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>Your scheduled booking (<strong>#" + BOOKING_ID_PLACEHOLDER + "</strong>) has been cancelled.</p>" +
                    "<p>If you have already paid for this session, your refund will be processed and returned to your original payment method shortly.</p>" +
                    "<p>If you have any questions, please reach out to our support team.</p>" +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    // --- GENERIC SYSTEM ALERTS(For Tickets, Escalations, etc.) ---
    private static final String SYSTEM_NOTIFICATION_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #3b82f6; color: white; padding: 20px; text-align: center;'><h1>Meet the Masters Alert</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>You have a new notification regarding your account:</p>" +
                    "<div style='background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;'>" +
                    "<strong>{message}</strong>" +
                    "</div>" +
                    "<p>Please log in to your dashboard for more details.</p>" +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    // --- TICKET TEMPLATES ---
    private static final String TICKET_CREATED_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #3b82f6; color: white; padding: 20px; text-align: center;'><h1>Ticket Received</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>Hello, we have received your support request.</p>" +
                    "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li><strong>Ticket ID:</strong> " + TICKET_ID_PLACEHOLDER + "</li>" +
                    "<li><strong>Category:</strong> {category}</li>" +
                    "<li><strong>Status:</strong> NEW</li>" +
                    "</ul>" +
                    "<p>Our team will review your ticket and respond shortly. You will receive an email when there is an update.</p>" +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    private static final String TICKET_UPDATED_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #8b5cf6; color: white; padding: 20px; text-align: center;'><h1>Ticket Updated</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>There has been an update to your support ticket.</p>" +
                    "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li><strong>Ticket ID:</strong> " + TICKET_ID_PLACEHOLDER + "</li>" +
                    "<li><strong>New Status:</strong> {status}</li>" +
                    "</ul>" +
                    "<p>Please log in to your dashboard to view the latest comments or provide additional details.</p>" +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    private static final String TICKET_ASSIGNED_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #f97316; color: white; padding: 20px; text-align: center;'><h1>New Ticket Assigned</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>A new support ticket has been assigned to you.</p>" +
                    "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li><strong>Ticket ID:</strong> " + TICKET_ID_PLACEHOLDER + "</li>" +
                    "</ul>" +
                    "<p>Please log in to the consultant portal to review the issue and assist the customer.</p>" +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    // Template: Comment Alert (For both User and Consultant)
    private static final String TICKET_COMMENT_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #0ea5e9; color: white; padding: 20px; text-align: center;'><h1>New Message on Ticket</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>A new message has been posted on your ticket.</p>" +
                    "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li><strong>Ticket ID:</strong> " + TICKET_ID_PLACEHOLDER + "</li>" +
                    "</ul>" +
                    "<p>Please log in to your dashboard to view the message and reply.</p>" +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    // ==========================================
    // 🌟 SPECIAL BOOKING TEMPLATES
    // ==========================================

    private static final String SPECIAL_BOOKING_CONFIRMED_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #10b981; color: white; padding: 20px; text-align: center;'><h1>Slot Confirmed!</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>Great news! The consultant has assigned the schedule for your special booking.</p>" +
                    "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li><strong>Booking ID:</strong> #" + BOOKING_ID_PLACEHOLDER + "</li>" +
                    "<li><strong>Consultant Email:</strong> " + CONSULTANT_EMAIL_PLACEHOLDER + "</li>" +
                    "<li><strong>Date:</strong> " + DATE_PLACEHOLDER + "</li>" +
                    "<li><strong>Time:</strong> " + TIME_PLACEHOLDER + "</li>" +
                    "<li><strong>Duration:</strong> " + HOURS_PLACEHOLDER + " Hour(s)</li>" +
                    "<li><strong>Meeting Mode:</strong> " + MEETING_MODE_PLACEHOLDER + "</li>" +
                    "</ul>" +
                    DYNAMIC_USER_FOOTER +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    private static final String SPECIAL_BOOKING_CONSULTANT_CONFIRM_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #8b5cf6; color: white; padding: 20px; text-align: center;'><h1>Schedule Confirmed</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>You have successfully assigned the schedule for a Special Booking.</p>" +
                    "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li><strong>Booking ID:</strong> #" + BOOKING_ID_PLACEHOLDER + "</li>" +
                    "<li><strong>Client Email:</strong> " + CLIENT_EMAIL_PLACEHOLDER + "</li>" +
                    "<li><strong>Date:</strong> " + DATE_PLACEHOLDER + "</li>" +
                    "<li><strong>Time:</strong> " + TIME_PLACEHOLDER + "</li>" +
                    "<li><strong>Duration:</strong> " + HOURS_PLACEHOLDER + " Hour(s)</li>" +
                    "<li><strong>Meeting Mode:</strong> " + MEETING_MODE_PLACEHOLDER + "</li>" +
                    "</ul>" +
                    DYNAMIC_CONSULTANT_FOOTER +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    // 🎨 NEW Template: Special Booking Rescheduled (User)
    private static final String SPECIAL_BOOKING_RESCHEDULED_USER_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #3b82f6; color: white; padding: 20px; text-align: center;'><h1>Special Booking Rescheduled</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>Your special booking has been rescheduled.</p>" +
                    "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li><strong>Booking ID:</strong> #" + BOOKING_ID_PLACEHOLDER + "</li>" +
                    "<li><strong>Consultant Email:</strong> " + CONSULTANT_EMAIL_PLACEHOLDER + "</li>" +
                    "<li><strong>New Date:</strong> " + DATE_PLACEHOLDER + "</li>" +
                    "<li><strong>New Time:</strong> " + TIME_PLACEHOLDER + "</li>" +
                    "<li><strong>Duration:</strong> " + HOURS_PLACEHOLDER + " Hour(s)</li>" +
                    "<li><strong>Meeting Mode:</strong> " + MEETING_MODE_PLACEHOLDER + "</li>" +
                    "</ul>" +
                    DYNAMIC_USER_FOOTER +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    // 🎨 NEW Template: Special Booking Rescheduled (Consultant)
    private static final String SPECIAL_BOOKING_RESCHEDULED_CONSULTANT_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #f59e0b; color: white; padding: 20px; text-align: center;'><h1>Special Booking Rescheduled</h1></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>You have successfully rescheduled a Special Booking.</p>" +
                    "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li><strong>Booking ID:</strong> #" + BOOKING_ID_PLACEHOLDER + "</li>" +
                    "<li><strong>Client Email:</strong> " + CLIENT_EMAIL_PLACEHOLDER + "</li>" +
                    "<li><strong>New Date:</strong> " + DATE_PLACEHOLDER + "</li>" +
                    "<li><strong>New Time:</strong> " + TIME_PLACEHOLDER + "</li>" +
                    "<li><strong>Duration:</strong> " + HOURS_PLACEHOLDER + " Hour(s)</li>" +
                    "<li><strong>Meeting Mode:</strong> " + MEETING_MODE_PLACEHOLDER + "</li>" +
                    "</ul>" +
                    DYNAMIC_CONSULTANT_FOOTER +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    // 🎨 UPDATED: Template for alerting the consultant (now includes User details)
    private static final String SPECIAL_BOOKING_CONSULTANT_REQUEST_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #f59e0b; color: white; padding: 20px; text-align: center;'><h2>Action Required: New Special Booking</h2></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>A client (<strong>" + CLIENT_EMAIL_PLACEHOLDER + "</strong>) has paid for <strong>" + HOURS_PLACEHOLDER + " hour(s)</strong> (Request #" + BOOKING_ID_PLACEHOLDER + ").</p>" +
                    "<p><strong>Meeting Mode:</strong> " + MEETING_MODE_PLACEHOLDER + "</p>" +
                    "<p><strong>Client Notes:</strong> {userNotes}</p>" +
                    "<p>Please log in to your portal to assign the date and time.</p>" +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    // 🎨 NEW: Template for confirming the request to the User
    private static final String SPECIAL_BOOKING_USER_REQUEST_BODY =
            "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                    "<div style='background-color: #3b82f6; color: white; padding: 20px; text-align: center;'><h2>Special Booking Requested</h2></div>" +
                    "<div style='padding: 30px;'>" +
                    "<p>Your special booking request for <strong>" + HOURS_PLACEHOLDER + " hour(s)</strong> has been successfully placed (Request #" + BOOKING_ID_PLACEHOLDER + ").</p>" +
                    "<p><strong>Consultant Email:</strong> " + CONSULTANT_EMAIL_PLACEHOLDER + "</p>" +
                    "<p><strong>Meeting Mode:</strong> " + MEETING_MODE_PLACEHOLDER + "</p>" +
                    "<p>We have notified the consultant. You will receive another email once they assign a date and time for the session.</p>" +
                    ACTION_BUTTON_PLACEHOLDER +
                    END_DIVS;

    // ==========================================
    // ⚙️ CORE EMAIL SENDER LOGIC
    // ==========================================

    public void sendEmail(String to, String subject, String body) {
        try {
            MimeMessage message = javaMailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setFrom(senderEmail);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(body, true);

            javaMailSender.send(message);
        } catch (Exception e) {
            // Catch the error so the async thread doesn't die silently
            log.error("Async Email Delivery Failed to {}: {}", to, e.getMessage());
        }
    }

    // ==========================================
    // 🎨 HELPER METHODS FOR DYNAMIC FOOTERS
    // ==========================================

    private String getDynamicUserFooter(String meetingMode, String meetingLink, boolean isReschedule) {
        if ("ONLINE".equalsIgnoreCase(meetingMode)) {
            String timingText = isReschedule ? "newly scheduled time" : "scheduled time";
            if (meetingLink != null && !meetingLink.isBlank()) {
                return "<p style='margin:16px 0 8px; font-weight:bold;'>🔗 Your Meeting Link:</p>" +
                        "<a href='" + meetingLink + "' style='color:#2563EB; font-size:15px; word-break:break-all;'>" + meetingLink + "</a>" +
                        "<p style='color:#64748b; font-size:12px; margin-top:4px;'>Click the link above at your " + timingText + " to join your session.</p>";
            } else {
                return "<p><em>Your meeting link will appear in your dashboard once generated by the consultant.</em></p>";
            }
        } else if ("PHONE".equalsIgnoreCase(meetingMode)) {
            return "<div style='background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 10px; margin-top: 15px;'>" +
                    "<p style='margin:0; font-weight:bold; color:#d97706;'>📞 Phone Consultation</p>" +
                    "<p style='margin:5px 0 0 0; font-size: 14px;'>The consultant will call you directly at the scheduled time.</p></div>";
        } else {
            return "<div style='background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 10px; margin-top: 15px;'>" +
                    "<p style='margin:0; font-weight:bold; color:#059669;'>📍 In-Person Consultation</p>" +
                    "<p style='margin:5px 0 0 0; font-size: 14px;'>Please attend the session at the scheduled location. The location details will be provided by the consultant through a phone call in advance of the meeting.</p></div>";
        }
    }

    private String getDynamicConsultantFooter(String meetingMode, String meetingLink, boolean isRequest) {
        if ("ONLINE".equalsIgnoreCase(meetingMode)) {
            if (isRequest) {
                return "<p>Please log in to your consultant portal to view the client's notes and generate a meeting link.</p>";
            }
            if (meetingLink != null && !meetingLink.isBlank()) {
                return "<p><strong>Meeting Link:</strong> <a href='" + meetingLink + "'>" + meetingLink + "</a></p>";
            } else {
                return "<p><strong>Meeting Link:</strong> " + PENDING_LINK_TEXT + "</p>" +
                        "<p><em>Please log in to your consultant portal to generate and update the meeting link.</em></p>";
            }
        } else if ("PHONE".equalsIgnoreCase(meetingMode)) {
            return "<div style='background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 10px; margin-top: 15px;'>" +
                    "<p style='margin:0; font-weight:bold; color:#d97706;'>📞 Action Required: Phone Consultation</p>" +
                    "<p style='margin:5px 0 0 0; font-size: 14px;'>Reminder: You are required to call the client at the scheduled time.</p></div>";
        } else {
            return "<div style='background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 10px; margin-top: 15px;'>" +
                    "<p style='margin:0; font-weight:bold; color:#059669;'>📍 Action Required: In-Person Consultation</p>" +
                    "<p style='margin:5px 0 0 0; font-size: 14px;'>You are required to call the client in advance to provide them with the exact location details for this meeting.</p></div>";
        }
    }

    // ==========================================
    // ✉️ EMAIL TRIGGERS
    // ==========================================

    // --- AUTHENTICATION ---
    public void sendRegistrationOtp(String to, String otp, String firstName) {
        String body = REGISTRATION_OTP_BODY
                .replace("{otpValue}", otp)
                .replace("{firstName}", firstName != null && !firstName.isBlank() ? firstName : "User");
        sendEmail(to, REGISTRATION_SUBJECT, body);
    }

    public void sendPasswordResetOtp(String to, String otp) {
        String resetBody =
                "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                        "<div style='background-color: #ef4444; color: white; padding: 20px; text-align: center;'><h1>Password Reset</h1></div>" +
                        "<div style='padding: 30px;'>" +
                        "<p>We received a request to reset your password. Use the code below to proceed:</p>" +
                        "<div style='background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; color: #b91c1c; letter-spacing: 5px;'>" + otp + "</div>" +
                        "<p>This code expires in 10 minutes. If you didn't request this, please secure your account.</p>" +
                        END_DIVS;
        sendEmail(to, "Password Reset Request - Meet the Masters", resetBody);
    }

    // --- WELCOME EMAIL ---
    public void sendWelcomeCredentials(String to, String name, String rawPassword) {
        String body = WELCOME_CREDENTIALS_BODY
                .replace("{name}", name != null ? name : "User")
                .replace("{email}", to)
                .replace("{password}", rawPassword)
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/login", "Login Now"));
        sendEmail(to, "Your Account Credentials - Meet the Masters", body);
    }

    // --- BOOKINGS ---
    public void sendBookingConfirmationToUser(String to, Long bookingId, String meetingMode, String amount, String discountAmount, String meetingLink) {
        String body = BOOKING_USER_BODY
                .replace(BOOKING_ID_PLACEHOLDER, String.valueOf(bookingId))
                .replace(MEETING_MODE_PLACEHOLDER, meetingMode)
                .replace("{discountAmount}", discountAmount != null ? discountAmount : "0.00")
                .replace("{amount}", amount != null ? amount : "0.00")
                .replace(DYNAMIC_USER_FOOTER, getDynamicUserFooter(meetingMode, meetingLink, false))
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "View Session"));

        sendEmail(to, "Booking Confirmed - Meet the Masters", body);
    }

    public void sendBookingAlertToConsultant(String to, Long bookingId, String meetingMode, String clientEmail, String meetingLink) {
        String body = BOOKING_CONSULTANT_BODY
                .replace(BOOKING_ID_PLACEHOLDER, String.valueOf(bookingId))
                .replace(CLIENT_EMAIL_PLACEHOLDER, clientEmail)
                .replace(MEETING_MODE_PLACEHOLDER, meetingMode)
                .replace(DYNAMIC_CONSULTANT_FOOTER, getDynamicConsultantFooter(meetingMode, meetingLink, true))
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "View Portal"));
        sendEmail(to, "New Appointment Alert - Meet the Masters", body);
    }

    // Trigger method for Normal Booking Reschedule User
    public void sendNormalBookingRescheduledToUser(String to, Long bookingId, String meetingMode, String meetingLink) {
        String body = NORMAL_BOOKING_RESCHEDULED_USER_BODY
                .replace(BOOKING_ID_PLACEHOLDER, String.valueOf(bookingId))
                .replace(MEETING_MODE_PLACEHOLDER, meetingMode)
                .replace(DYNAMIC_USER_FOOTER, getDynamicUserFooter(meetingMode, meetingLink, true))
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "View Updates"));

        sendEmail(to, "Booking Rescheduled - Meet the Masters", body);
    }

    // Trigger method for Normal Booking Reschedule Consultant
    public void sendNormalBookingRescheduledAlertToConsultant(String to, Long bookingId, String meetingMode, String clientEmail, String meetingLink) {
        String body = NORMAL_BOOKING_RESCHEDULED_CONSULTANT_BODY
                .replace(BOOKING_ID_PLACEHOLDER, String.valueOf(bookingId))
                .replace(CLIENT_EMAIL_PLACEHOLDER, clientEmail)
                .replace(MEETING_MODE_PLACEHOLDER, meetingMode)
                .replace(DYNAMIC_CONSULTANT_FOOTER, getDynamicConsultantFooter(meetingMode, meetingLink, false))
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", VIEW_SCHEDULE_TEXT));
        sendEmail(to, "Appointment Rescheduled - Meet the Masters", body);
    }

    // Cancellation method triggered by the Admin action
    public void sendBookingCancellationToUser(String to, Long bookingId) {
        String body = BOOKING_CANCELLED_BODY
                .replace(BOOKING_ID_PLACEHOLDER, String.valueOf(bookingId))
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "View Bookings"));
        sendEmail(to, "Booking Cancelled - Meet the Masters", body);
    }

    // Notify Consultant of Cancellation
    public void sendBookingCancellationToConsultant(String to, Long bookingId) {
        String body = "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                "<div style='background-color: #ef4444; color: white; padding: 20px; text-align: center;'><h1>Appointment Cancelled</h1></div>" +
                "<div style='padding: 30px;'><p>Booking <strong>#" + bookingId + "</strong> has been cancelled.</p><p>This time slot is now open and available for other clients to book.</p>" +
                getActionButton(frontendUrl + "/", VIEW_SCHEDULE_TEXT) +
                END_DIVS;
        sendEmail(to, "Appointment Cancelled - Meet the Masters", body);
    }

    // Notify User of Admin Reassignment
    public void sendBookingReassignedToUser(String to, Long bookingId) {
        String body = "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                "<div style='background-color: #3b82f6; color: white; padding: 20px; text-align: center;'><h1>Booking Rescheduled</h1></div>" +
                "<div style='padding: 30px;'><p>Your booking (<strong>#" + bookingId + "</strong>) has been updated by an Administrator.</p><p>Please log in to your dashboard to view your new Consultant and Time Slot details.</p>" +
                getActionButton(frontendUrl + "/", "View Dashboard") +
                END_DIVS;
        sendEmail(to, "Booking Rescheduled - Meet the Masters", body);
    }

    // Notify Old Consultant of Admin Reassignment
    public void sendBookingRemovedFromConsultant(String to, Long bookingId) {
        String body = "<div style='font-family: Arial; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px;'>" +
                "<div style='background-color: #64748b; color: white; padding: 20px; text-align: center;'><h1>Schedule Update</h1></div>" +
                "<div style='padding: 30px;'><p>Booking <strong>#" + bookingId + "</strong> has been reassigned to another consultant by an Administrator.</p><p>This slot is now available on your schedule again.</p>" +
                getActionButton(frontendUrl + "/", VIEW_SCHEDULE_TEXT) +
                END_DIVS;
        sendEmail(to, "Schedule Update - Meet the Masters", body);
    }

    // --- SYSTEM & ESCALATIONS ---
    public void sendSystemNotification(String to, String notificationMessage) {
        String body = SYSTEM_NOTIFICATION_BODY
                .replace("{message}", notificationMessage)
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "View Notifications"));
        sendEmail(to, "New Notification - Meet the Masters", body);
    }

    // --- TICKETS ---
    public void sendTicketCreatedEmail(String to, String ticketNumber, String category) {
        String body = TICKET_CREATED_BODY
                .replace(TICKET_ID_PLACEHOLDER, ticketNumber)
                .replace("{category}", category)
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "View Ticket"));
        sendEmail(to, "Ticket Received: #" + ticketNumber, body);
    }

    public void sendTicketUpdatedEmail(String to, String ticketNumber, String status) {
        String body = TICKET_UPDATED_BODY
                .replace(TICKET_ID_PLACEHOLDER, ticketNumber)
                .replace("{status}", status)
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "Check Updates"));
        sendEmail(to, "Ticket Update: #" + ticketNumber, body);
    }

    public void sendTicketAssignedEmail(String to, String ticketNumber) {
        String body = TICKET_ASSIGNED_BODY
                .replace(TICKET_ID_PLACEHOLDER, ticketNumber)
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "View Support Tickets"));
        sendEmail(to, "New Ticket Assigned: #" + ticketNumber, body);
    }

    public void sendTicketCommentEmail(String to, String ticketNumber) {
        String body = TICKET_COMMENT_BODY
                .replace(TICKET_ID_PLACEHOLDER, ticketNumber)
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "Reply to Message"));
        sendEmail(to, "New Message on Ticket #" + ticketNumber, body);
    }

    // Using SpecialBookingEmailData object to prevent > 7 parameters warning
    public void sendSpecialBookingConfirmedToUser(String to, SpecialBookingEmailData data) {
        String body = SPECIAL_BOOKING_CONFIRMED_BODY
                .replace(BOOKING_ID_PLACEHOLDER, String.valueOf(data.bookingId()))
                .replace(CONSULTANT_EMAIL_PLACEHOLDER, data.otherPartyEmail() != null ? data.otherPartyEmail() : UNKNOWN_FALLBACK)
                .replace(DATE_PLACEHOLDER, data.date())
                .replace(TIME_PLACEHOLDER, data.time())
                .replace(HOURS_PLACEHOLDER, String.valueOf(data.hours()))
                .replace(MEETING_MODE_PLACEHOLDER, data.meetingMode())
                .replace(DYNAMIC_USER_FOOTER, getDynamicUserFooter(data.meetingMode(), data.meetingLink(), false))
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "View Session"));
        sendEmail(to, "Special Booking Confirmed - Meet the Masters", body);
    }

    // Using SpecialBookingEmailData object to prevent > 7 parameters warning
    public void sendSpecialBookingConfirmedToConsultant(String to, SpecialBookingEmailData data) {
        String body = SPECIAL_BOOKING_CONSULTANT_CONFIRM_BODY
                .replace(BOOKING_ID_PLACEHOLDER, String.valueOf(data.bookingId()))
                .replace(CLIENT_EMAIL_PLACEHOLDER, data.otherPartyEmail() != null ? data.otherPartyEmail() : UNKNOWN_FALLBACK)
                .replace(DATE_PLACEHOLDER, data.date())
                .replace(TIME_PLACEHOLDER, data.time())
                .replace(HOURS_PLACEHOLDER, String.valueOf(data.hours()))
                .replace(MEETING_MODE_PLACEHOLDER, data.meetingMode())
                .replace(DYNAMIC_CONSULTANT_FOOTER, getDynamicConsultantFooter(data.meetingMode(), data.meetingLink(), false))
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "Manage Schedule"));
        sendEmail(to, "Special Booking Scheduled - Meet the Masters", body);
    }

    // Using SpecialBookingEmailData object to prevent > 7 parameters warning
    public void sendSpecialBookingRescheduledToUser(String to, SpecialBookingEmailData data) {
        String body = SPECIAL_BOOKING_RESCHEDULED_USER_BODY
                .replace(BOOKING_ID_PLACEHOLDER, String.valueOf(data.bookingId()))
                .replace(CONSULTANT_EMAIL_PLACEHOLDER, data.otherPartyEmail() != null ? data.otherPartyEmail() : UNKNOWN_FALLBACK)
                .replace(DATE_PLACEHOLDER, data.date())
                .replace(TIME_PLACEHOLDER, data.time())
                .replace(HOURS_PLACEHOLDER, String.valueOf(data.hours()))
                .replace(MEETING_MODE_PLACEHOLDER, data.meetingMode())
                .replace(DYNAMIC_USER_FOOTER, getDynamicUserFooter(data.meetingMode(), data.meetingLink(), true))
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "View New Timing"));
        sendEmail(to, "Special Booking Rescheduled - Meet the Masters", body);
    }

    // Using SpecialBookingEmailData object to prevent > 7 parameters warning
    public void sendSpecialBookingRescheduledToConsultant(String to, SpecialBookingEmailData data) {
        String body = SPECIAL_BOOKING_RESCHEDULED_CONSULTANT_BODY
                .replace(BOOKING_ID_PLACEHOLDER, String.valueOf(data.bookingId()))
                .replace(CLIENT_EMAIL_PLACEHOLDER, data.otherPartyEmail() != null ? data.otherPartyEmail() : UNKNOWN_FALLBACK)
                .replace(DATE_PLACEHOLDER, data.date())
                .replace(TIME_PLACEHOLDER, data.time())
                .replace(HOURS_PLACEHOLDER, String.valueOf(data.hours()))
                .replace(MEETING_MODE_PLACEHOLDER, data.meetingMode())
                .replace(DYNAMIC_CONSULTANT_FOOTER, getDynamicConsultantFooter(data.meetingMode(), data.meetingLink(), false))
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "View Updated Schedule"));
        sendEmail(to, "Special Booking Rescheduled - Meet the Masters", body);
    }

    // ✉️ UPDATED: Trigger method for the Consultant
    public void sendSpecialBookingRequestToConsultant(String to, Long bookingId, int hours, String clientEmail, String meetingMode, String userNotes) {
        String body = SPECIAL_BOOKING_CONSULTANT_REQUEST_BODY
                .replace(BOOKING_ID_PLACEHOLDER, String.valueOf(bookingId))
                .replace(HOURS_PLACEHOLDER, String.valueOf(hours))
                .replace(CLIENT_EMAIL_PLACEHOLDER, clientEmail != null ? clientEmail : UNKNOWN_FALLBACK)
                .replace(MEETING_MODE_PLACEHOLDER, meetingMode != null ? meetingMode : "N/A")
                .replace("{userNotes}", userNotes != null ? userNotes : "No notes provided")
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "Assign Slot Now"));
        sendEmail(to, "Action Required: New Special Booking Request", body);
    }

    // ✉️ NEW: Trigger method for the User
    public void sendSpecialBookingRequestToUser(String to, Long bookingId, int hours, String consultantEmail, String meetingMode) {
        String body = SPECIAL_BOOKING_USER_REQUEST_BODY
                .replace(BOOKING_ID_PLACEHOLDER, String.valueOf(bookingId))
                .replace(HOURS_PLACEHOLDER, String.valueOf(hours))
                .replace(CONSULTANT_EMAIL_PLACEHOLDER, consultantEmail != null ? consultantEmail : UNKNOWN_FALLBACK)
                .replace(MEETING_MODE_PLACEHOLDER, meetingMode != null ? meetingMode : "N/A")
                .replace(ACTION_BUTTON_PLACEHOLDER, getActionButton(frontendUrl + "/", "View Request Status"));
        sendEmail(to, "Special Booking Request Placed", body);
    }
}