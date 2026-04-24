package com.rupee.service;

import com.rupee.entity.User;
import com.rupee.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service("securityService")
@RequiredArgsConstructor
public class SecurityService {

    private final UserRepository userRepository;

    /**
     * Gets the currently authenticated User entity from the security context.
     * This is the central method for fetching the current user's details.
     *
     * @return The User entity.
     * @throws UsernameNotFoundException if the user is not found in the database.
     * @throws IllegalStateException if there is no authenticated user in the context.
     */
    public User getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated() || "anonymousUser".equals(authentication.getPrincipal())) {
            throw new IllegalStateException("User is not authenticated.");
        }

        // The authentication principal's name is now your 'identifier' (Email or Mobile)
        String identifier = authentication.getName();

        return userRepository.findByIdentifier(identifier)
                .orElseThrow(() -> new UsernameNotFoundException("Authenticated user not found in database: " + identifier));
    }
}