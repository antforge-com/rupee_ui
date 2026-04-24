package com.rupee.service;

import com.rupee.dto.request.TicketRequest;
import com.rupee.dto.response.TicketResponse;
import com.rupee.entity.EmailToTicketMapping;
import com.rupee.entity.User;
import com.rupee.enums.TicketEnums.Priority;
import com.rupee.repository.EmailToTicketMappingRepository;
import com.rupee.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import jakarta.mail.*;
import jakarta.mail.internet.InternetAddress;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailToTicketService {

    private final EmailToTicketMappingRepository emailMappingRepository;
    private final UserRepository userRepository;
    private final TicketService ticketService;
    private final EmailService emailService;
    private final NotificationService notificationService;
    private final S3StorageService s3StorageService;

    @Value("${email.imap.host:imap.gmail.com}")
    private String imapHost;

    @Value("${email.imap.port:993}")
    private int imapPort;

    @Value("${email.imap.username}")
    private String imapUsername;

    @Value("${email.imap.password}")
    private String imapPassword;

    @Value("${email.imap.folder}")
    private String imapFolder;

    @Value("${email.processing.enabled}")
    private boolean emailProcessingEnabled;

    private static final String MIME_TEXT_PLAIN = "text/plain";
    private static final String MIME_TEXT_HTML = "text/html";
    private static final String MIME_MULTIPART = "multipart/*";
    private static final String UNKNOWN_EMAIL = "unknown@example.com";
    private static final String FALSE_STRING = "false";
    private static final long SEVEN_DAYS_MS = 7L * 24 * 60 * 60 * 1000L;
    private static final int MAX_BODY_LENGTH = 2000;

    private static final Pattern PRIORITY_PATTERN = Pattern.compile("\\[(?i:urgent|high|critical)]");

    private static final List<String> SYSTEM_EMAIL_PATTERNS = Arrays.asList(
            "mailer-daemon", "mail-daemon", "noreply", "no-reply", "donotreply",
            "do-not-reply", "postmaster", "system@", "support+auto", "bounce@",
            "undeliverable", "notification@", "alert@", "admin@", "@mx.google.com",
            "@googlemail.com", "delivery-status@", "maildaemon", "failure-notice",
            "returned mail", "fbl@", "abuse@", "security@", "noreply@", "no-reply@",
            "robot@", "automated@", "no-reply-", "notification-", "verify@", "confirm@",
            "activation@", "support@example.com", "feedback@", "survey@", "auto-reply"
    );

    private static final Map<String, List<String>> TICKET_CATEGORIES = Map.of(
            "Billing", Arrays.asList("billing", "invoice", "payment", "charge"),
            "Technical Support", Arrays.asList("technical", "error", "bug", "crash", "not working"),
            "Account", Arrays.asList("account", "login", "password", "access"),
            "Consultation", Arrays.asList("consultation", "booking", "appointment", "meeting")
    );

    @Scheduled(fixedRateString = "${email.polling.interval}")
    public void pollAndProcessEmails() {
        if (!emailProcessingEnabled) {
            return;
        }

        Store store = null;
        Folder folder = null;

        try {
            store = connectToEmailServer();
            if (store == null || !store.isConnected()) {
                log.error("Failed to connect to email server");
                return;
            }

            folder = store.getFolder(imapFolder);
            if (!folder.isOpen()) {
                folder.open(Folder.READ_WRITE);
            }

            Message[] allMessages = folder.getMessages();
            List<Message> eligibleMessages = filterEligibleMessages(allMessages);

            for (Message message : eligibleMessages) {
                processMessageSafe(message);
            }

        } catch (Exception e) {
            log.error("Error in email polling cycle: {}", e.getMessage(), e);
        } finally {
            closeResourcesSafely(folder, store);
        }
    }

    private List<Message> filterEligibleMessages(Message[] allMessages) {
        List<Message> eligibleMessages = new ArrayList<>();
        long sevenDaysAgo = System.currentTimeMillis() - SEVEN_DAYS_MS;

        for (Message msg : allMessages) {
            try {
                if (!msg.isSet(Flags.Flag.SEEN)) {
                    Date receivedDate = msg.getReceivedDate();

                    // Only process if the date exists AND the email is less than 7 days old
                    if (receivedDate != null && receivedDate.getTime() >= sevenDaysAgo) {
                        String sender = getEmailFrom(msg);
                        if (isSystemEmail(sender)) {
                            markMessageAsSeenSafe(msg);
                        } else {
                            eligibleMessages.add(msg);
                        }
                    }
                }
            } catch (Exception e) {
                // Silently swallow flag reading errors to prevent log bloat
            }
        }

        return eligibleMessages;
    }

    private void processMessageSafe(Message message) {
        String senderEmail = UNKNOWN_EMAIL;
        try {
            senderEmail = getEmailFrom(message);
            processEmail(message);
        } catch (Exception e) {
            log.error("Error processing email from {}: {}", senderEmail, e.getMessage(), e);
        }
    }

    protected void processEmail(Message message) throws MessagingException {
        String messageId = getMessageId(message);
        String senderEmail = getEmailFrom(message);
        boolean success = false;

        try {
            if (emailMappingRepository.findByEmailMessageId(messageId).isPresent()) {
                markMessageAsSeenSafe(message);
                return;
            }

            String subject = message.getSubject();
            if (isConfirmationOrNotification(subject)) {
                markMessageAsSeenSafe(message);
                return;
            }

            String body = getEmailBody(message);
            if (body.trim().isEmpty()) {
                body = subject != null && !subject.trim().isEmpty() ? subject : "No content";
            }

            User user = resolveExistingUser(senderEmail);
            if (user == null || user.getId() == null) {
                markMessageAsSeenSafe(message);
                return;
            }

            String attachmentUrl = getAttachmentUrl(message);
            long receivedTime = message.getReceivedDate() != null ? message.getReceivedDate().getTime() : System.currentTimeMillis();

            success = createAndMapTicket(user, senderEmail, subject, body, messageId, receivedTime, attachmentUrl);

            if (success) {
                message.setFlag(Flags.Flag.SEEN, true);
            }

        } catch (Exception e) {
            log.error("===== Email processing FAILED =====\nException: {}\nMessage: {}\nSender: {}, Message ID: {}",
                    e.getClass().getSimpleName(), e.getMessage(), senderEmail, messageId, e);
        } finally {
            if (!success) {
                try {
                    message.setFlag(Flags.Flag.SEEN, false);
                } catch (Exception flagError) {
                    log.warn("Failed to reset message flag: {}", flagError.getMessage());
                }
            }
        }
    }

    private boolean createAndMapTicket(User user, String senderEmail, String subject, String body,
                                       String messageId, long receivedTime, String attachmentUrl) {

        String category = detectCategory(subject, body);
        Priority priority = detectPriority(subject, body);

        TicketRequest ticketRequest = new TicketRequest();
        ticketRequest.setUserId(user.getId());
        ticketRequest.setCategory(category);
        ticketRequest.setAttachmentUrl(attachmentUrl);
        ticketRequest.setPriority(priority);

        String description = body;
        if (description != null && description.length() > MAX_BODY_LENGTH) {
            description = description.substring(0, MAX_BODY_LENGTH);
        }
        ticketRequest.setDescription(description);

        TicketResponse ticketResponse = ticketService.createTicket(ticketRequest, null);

        if (ticketResponse == null || ticketResponse.getId() == null) {
            log.error("Ticket service returned null or invalid response for email {}", messageId);
            return false;
        }

        EmailToTicketMapping mapping = new EmailToTicketMapping();
        mapping.setTicketId(ticketResponse.getId());
        mapping.setEmailMessageId(messageId);
        mapping.setSenderEmail(senderEmail);
        mapping.setSubject(subject);
        mapping.setReceivedAt(LocalDateTime.ofInstant(
                new Date(receivedTime).toInstant(),
                ZoneId.systemDefault()
        ));
        mapping.setProcessedAt(LocalDateTime.now());

        emailMappingRepository.save(mapping);

        // ✅ The Golden Compromise: The only non-error log in the class
        log.info("Email-to-ticket mapping saved for Message ID: {}", messageId);

        sendConfirmationEmail(user, ticketResponse);

        try {
            notificationService.notifyTicketCreated(
                    ticketResponse.getUserId(),
                    ticketResponse.getId(),
                    ticketResponse.getTicketNumber(),
                    ticketResponse.getCategory(),
                    ticketResponse.getConsultantId() // ✅ ADDED 5TH PARAMETER HERE
            );
        } catch (Exception e) {
            // Silently swallow notification errors
        }

        return true;
    }

    private Store connectToEmailServer() {
        try {
            Properties props = new Properties();
            props.put("mail.imap.host", imapHost);
            props.put("mail.imap.port", imapPort);
            props.put("mail.imap.socketFactory.port", imapPort);
            props.put("mail.imap.socketFactory.class", "javax.net.ssl.SSLSocketFactory");

            props.put("mail.imap.socketFactory.fallback", FALSE_STRING);
            props.put("mail.imap.auth.login.disable", FALSE_STRING);
            props.put("mail.imap.auth.plain.disable", FALSE_STRING);

            props.put("mail.imap.timeout", "30000");
            props.put("mail.imap.connectiontimeout", "30000");
            props.put("mail.imap.starttls.enable", "true");
            props.put("mail.imap.starttls.required", "true");
            props.put("mail.imap.ssl.trust", imapHost);

            Session session = Session.getInstance(props);
            Store store = session.getStore("imaps");

            store.connect(imapHost, imapPort, imapUsername, imapPassword);

            return store;
        } catch (Exception e) {
            log.error("Failed to connect to email server: {} - {}", e.getClass().getSimpleName(), e.getMessage(), e);
            return null;
        }
    }

    public User resolveExistingUser(String senderEmail) {
        if (isSystemEmail(senderEmail)) {
            return null;
        }
        // ✅ SonarQube Approved: Replaces the entire if-block with one clean functional expression
        return userRepository.findByIdentifier(senderEmail).orElse(null);
    }

    private boolean isSystemEmail(String email) {
        if (email == null || email.isEmpty()) {
            return true;
        }

        String lowerEmail = email.toLowerCase();
        if (lowerEmail.equals(imapUsername.toLowerCase())) {
            return true;
        }

        return SYSTEM_EMAIL_PATTERNS.stream().anyMatch(lowerEmail::contains);
    }

    private boolean isConfirmationOrNotification(String subject) {
        if (subject == null) return false;
        String lowerSubject = subject.toLowerCase();
        return lowerSubject.contains("ticket received") ||
                lowerSubject.contains("ticket created") ||
                lowerSubject.contains("ticket id:") ||
                lowerSubject.contains("support request") ||
                lowerSubject.contains("confirmation");
    }

    public String detectCategory(String subject, String body) {
        String content = ((subject != null ? subject : "") + " " + (body != null ? body : "")).toLowerCase();

        for (Map.Entry<String, List<String>> entry : TICKET_CATEGORIES.entrySet()) {
            for (String keyword : entry.getValue()) {
                if (content.contains(keyword)) {
                    return entry.getKey();
                }
            }
        }
        return "Other";
    }

    public Priority detectPriority(String subject, String body) {
        String content = ((subject != null ? subject : "") + " " + (body != null ? body : "")).toLowerCase();

        if (PRIORITY_PATTERN.matcher(content).find() ||
                content.contains("urgent") || content.contains("critical")) {
            return Priority.HIGH;
        }

        if (content.contains("asap") || content.contains("immediate")) {
            return Priority.MEDIUM;
        }

        return Priority.LOW;
    }

    private void sendConfirmationEmail(User user, TicketResponse ticket) {
        try {
            String confirmationTemplate = "<div style='font-family: Arial; max-width: 600px; margin: 0 auto;'>" +
                    "<h2>Thank you for reaching out!</h2>" +
                    "<p>Your email has been successfully converted to a support ticket.</p>" +
                    "<p><strong>Ticket Number:</strong> #" + ticket.getTicketNumber() + "</p>" +
                    "<p><strong>Category:</strong> " + ticket.getCategory() + "</p>" +
                    "<p><strong>Priority:</strong> " + ticket.getPriority() + "</p>" +
                    "<p>Our support team will get back to you shortly.</p>" +
                    "</div>";

            emailService.sendEmail(
                    user.getIdentifier(),
                    "Ticket Created - #" + ticket.getTicketNumber(),
                    confirmationTemplate
            );
        } catch (Exception e) {
            log.error("Failed to send confirmation email to {}: {}", user.getIdentifier(), e.getMessage());
        }
    }

    private String getMessageId(Message message) throws MessagingException {
        String[] headers = message.getHeader("Message-ID");
        if (headers != null && headers.length > 0) {
            return headers[0];
        }
        return message.getSubject() + "_" + getEmailFrom(message) + "_" + message.getReceivedDate().getTime();
    }

    private String getEmailFrom(Message message) {
        try {
            Address[] from = message.getFrom();
            if (from != null && from.length > 0) {
                return ((InternetAddress) from[0]).getAddress();
            }
        } catch (Exception e) {
            log.error("Error extracting email from message: {}", e.getMessage());
        }
        return UNKNOWN_EMAIL;
    }

    private String getEmailBody(Message message) {
        try {
            if (message.isMimeType(MIME_TEXT_PLAIN) || message.isMimeType(MIME_TEXT_HTML)) {
                Object content = message.getContent();
                if (content != null) {
                    String body = content.toString().trim();
                    if (!body.isEmpty()) return body;
                }
            } else if (message.isMimeType(MIME_MULTIPART)) {
                String text = getTextFromMultipart((Multipart) message.getContent());
                if (!text.trim().isEmpty()) return text;
            }
        } catch (Exception e) {
            // Silently swallow extraction errors
        }

        try {
            String subject = message.getSubject();
            if (subject != null && !subject.trim().isEmpty()) {
                return "Subject: " + subject;
            }
        } catch (Exception e) {
            log.error("Failed to extract subject as fallback: {}", e.getMessage());
        }
        return "Email body could not be extracted";
    }

    private String getTextFromMultipart(Multipart multipart) throws MessagingException {
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < multipart.getCount(); i++) {
            BodyPart part = multipart.getBodyPart(i);
            try {
                if (part.isMimeType(MIME_TEXT_PLAIN) || part.isMimeType(MIME_TEXT_HTML)) {
                    Object content = part.getContent();
                    if (content != null) {
                        result.append(content);
                    }
                } else if (part.isMimeType(MIME_MULTIPART)) {
                    result.append(getTextFromMultipart((Multipart) part.getContent()));
                }
            } catch (Exception e) {
                // Silently swallow part extraction errors
            }
        }
        return result.toString();
    }

    private String getAttachmentUrl(Message message) {
        try {
            if (message.isMimeType(MIME_MULTIPART)) {
                return extractAndSaveAttachment((Multipart) message.getContent());
            }
        } catch (Exception e) {
            // Silently swallow attachment check errors
        }
        return null;
    }

    private boolean isAttachmentPart(BodyPart part) throws MessagingException {
        return Part.ATTACHMENT.equalsIgnoreCase(part.getDisposition()) ||
                (part.getFileName() != null && !part.getFileName().isEmpty());
    }

    // ✅ S3 INTEGRATION ADDED HERE: Processes email attachments into memory and uploads to S3
    private String saveAttachmentFile(BodyPart part) throws MessagingException, IOException {
        String cleanFileName = StringUtils.cleanPath(part.getFileName() != null ? part.getFileName() : "email_attachment.file");
        if (cleanFileName.contains("..")) {
            cleanFileName = "safe_file_" + System.currentTimeMillis() + ".file";
        }

        byte[] fileData = part.getInputStream().readAllBytes();
        return s3StorageService.uploadFile(fileData, cleanFileName, part.getContentType(), "tickets");
    }

    private String extractAndSaveAttachment(Multipart multipart) throws MessagingException, IOException {
        for (int i = 0; i < multipart.getCount(); i++) {
            BodyPart part = multipart.getBodyPart(i);

            if (isAttachmentPart(part)) {
                return saveAttachmentFile(part);
            } else if (part.isMimeType(MIME_MULTIPART)) {
                String nestedAttachment = extractAndSaveAttachment((Multipart) part.getContent());
                if (nestedAttachment != null) return nestedAttachment;
            }
        }
        return null;
    }

    private void markMessageAsSeenSafe(Message message) {
        try {
            message.setFlag(Flags.Flag.SEEN, true);
        } catch (Exception e) {
            // Silently swallow to prevent log bloat
        }
    }

    private void closeResourcesSafely(Folder folder, Store store) {
        try {
            if (folder != null && folder.isOpen()) folder.close(false);
            if (store != null && store.isConnected()) store.close();
        } catch (Exception e) {
            // Silently swallow closing errors
        }
    }
}