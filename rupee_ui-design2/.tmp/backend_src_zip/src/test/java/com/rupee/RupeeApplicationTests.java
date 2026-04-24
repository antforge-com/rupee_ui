package com.rupee;

import com.rupee.service.EmailService;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@SpringBootTest
class RupeeApplicationTests {

	@MockitoBean // ✅ Replaces @MockBean
	private JavaMailSenderImpl javaMailSender; // ✅ This "fakes" the mail sender

	@Autowired
	private EmailService emailService; // Assuming you have this service

	@Test
	void contextLoads() {
		// Now this test will pass even without a mail server!
	}

	@Test
	void testEmailServiceDoesNotCrash() {
		// Because MimeMessage is a complex object, you have to tell the mock sender
		// to create an empty one when your service asks for it
		when(javaMailSender.createMimeMessage()).thenReturn(org.mockito.Mockito.mock(MimeMessage.class));

		// 1. Call your real service
		emailService.sendWelcomeCredentials("test@test.com", "John", "password123");

		// 2. Verify it attempted to send a MimeMessage
		// FIXED: We added timeout(2000).
		// Mockito will now wait up to 2 seconds for the async thread to hit the send() method!
		verify(javaMailSender, timeout(2000).times(1)).send(any(MimeMessage.class));
	}
}