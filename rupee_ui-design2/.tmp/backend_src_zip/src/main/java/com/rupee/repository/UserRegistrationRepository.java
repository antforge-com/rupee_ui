package com.rupee.repository;

import com.rupee.entity.UserRegistration;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public interface UserRegistrationRepository extends JpaRepository<UserRegistration, Long> {

    // Checks if a login email is already in use
    boolean existsByEmail(String email);

    // ✅ ADDED: Required to support uniqueness checks for the new phone number field
    boolean existsByPhoneNumber(String phoneNumber);

    // Finding registration details by the core User table ID
    Optional<UserRegistration> findByUserId(Long userId);

    // Cleaning up registration data when a user is deleted
    void deleteByUserId(Long userId);

    // --- NEW ANALYTICS QUERIES ---

    // Admin: User Registration Growth Chart (Monthly)
    @Query("SELECT new map(MONTH(u.memberSince) as month, COUNT(u.id) as count) " +
            "FROM UserRegistration u WHERE YEAR(u.memberSince) = YEAR(CURRENT_DATE) " +
            "GROUP BY MONTH(u.memberSince)")
    List<Map<String, Object>> getUserGrowthMonthly();

    // Fetch the newest users for the Admin Dashboard
    List<UserRegistration> findTop5ByOrderByMemberSinceDesc();
}