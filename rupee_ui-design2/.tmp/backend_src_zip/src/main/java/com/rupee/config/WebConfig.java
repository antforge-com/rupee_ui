package com.rupee.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web Configuration for standard MVC settings.
 * * NOTE: Local /uploads handling has been removed as the application now
 * utilizes AWS S3 for all file storage. CORS for S3 is handled at the
 * Bucket level in the AWS Console.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    // This class is now a clean placeholder for any future MVC
    // configurations (like interceptors or formatters).

}