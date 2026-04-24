package com.rupee.config;

import com.rupee.filter.JwtFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity // Replaces @EnableGlobalMethodSecurity
public class SecurityConfig {

    private final JwtFilter jwtFilter;
    private final CustomAccessDeniedHandler customAccessDeniedHandler;

    // Removed UserService from constructor as it's no longer needed for AuthManager config here
    public SecurityConfig(JwtFilter jwtFilter,
                          CustomAccessDeniedHandler customAccessDeniedHandler) {
        this.jwtFilter = jwtFilter;
        this.customAccessDeniedHandler = customAccessDeniedHandler;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    // Modern way to expose AuthenticationManager
    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration authConfig) throws Exception {
        return authConfig.getAuthenticationManager();
    }

    // Replaces the configure(HttpSecurity http) method
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // Use Lambda DSL for CORS and CSRF
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(AbstractHttpConfigurer::disable)

                // Replaces authorizeRequests()
                .authorizeHttpRequests(auth -> auth
                        // --- PUBLIC AUTH ENDPOINTS ---
                        .requestMatchers( // Replaces antMatchers()
                                "/api/users/authenticate",
                                "/api/users/oauth/google",
                                "/api/users/send-otp",
                                "/api/users/check-otp",
                                "/api/users/forgot-password",
                                "/api/users/reset-password",
                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/v2/api-docs",
                                "/v3/api-docs/**",
                                "/swagger-resources/**",
                                "/webjars/**",
                                "/actuator/**"
                        ).permitAll()

                        // Allow public access to contact form submission
                        .requestMatchers(HttpMethod.POST, "/api/contact/public/submit").permitAll()

                        // Added the base "/api/offers/public" so the homepage can fetch them
                        .requestMatchers(HttpMethod.GET, "/api/offers/public").permitAll()

                        // EXPLICITLY ALLOW ONBOARDING CREATION
                        // We specify HttpMethod.POST so people can register,
                        // but they might still need a token to DELETE or UPDATE their data later!
                        .requestMatchers(HttpMethod.POST, "/api/onboarding").permitAll()

                        // ALLOW PUBLIC ACCESS TO SUBSCRIPTION PLANS
                        .requestMatchers(HttpMethod.GET, "/api/subscription-plans").permitAll()

                        // Allow public access to highest-rated feedbacks to display in the homepage
                        .requestMatchers(HttpMethod.GET, "/api/feedbacks/public/highest-rated").permitAll()

                        // ALL OTHER REQUESTS
                        .anyRequest().authenticated()
                )
                // Use Lambda DSL for exception handling
                .exceptionHandling(ex -> ex
                        .accessDeniedHandler(customAccessDeniedHandler)
                )
                // Use Lambda DSL for session management
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                );

        // Add filters
        http.addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        //configuration.setAllowedOrigins(List.of("http://localhost:5173", "http://localhost:64108"));

        // 🚨 CRITICAL FIX: Use allowedOriginPatterns instead of allowedOrigins.
        // This accepts React (localhost:5173), Flutter Web (any dynamic port),
        // AND Flutter Mobile Emulators (10.0.2.2) without crashing Spring Boot!
        //configuration.setAllowedOriginPatterns(List.of("*"));

        // ✅ ADDED: GitHub Pages production URL + Localhost wildcard for dev
        // configuration.setAllowedOriginPatterns(List.of(
        //        "http://localhost:*",             // Allows React (5173) & Flutter Web/Mobile
        //        "https://antforge-com.github.io"  // Allows your live deployed frontend
        // ));

        // ✅ UPDATED: Wide open for testing.
        // Using "Patterns" instead of "Origins" legally bypasses the browser's credential rules.
        configuration.setAllowedOriginPatterns(List.of("*"));

        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        configuration.setAllowedHeaders(List.of("Content-Type", "Authorization", "X-Requested-With"));
        configuration.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}