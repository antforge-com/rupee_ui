package com.rupee.repository;

import com.rupee.dto.response.UserResponse;
import com.rupee.entity.User;
import com.rupee.enums.UserEnums.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional; // ✅ Needed for deletion

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    // Helper to find users by their email/mobile identifier
    Optional<User> findByIdentifier(String identifier);

    boolean existsByIdentifier(String identifier);

    List<User> findByRole(Role role);

    // OPTION B: Needed to fetch the identifier (email) for the frontend dashboard
    // Find the user that owns this consultant profile
    Optional<User> findByConsultantId(Long consultantId);

    // OPTION B: High-performance delete query to wipe the User when Consultant is deleted
    @Transactional
    @Modifying
    @Query("DELETE FROM User u WHERE u.consultantId = :consultantId")
    void deleteByConsultantId(@Param("consultantId") Long consultantId);

    // UPDATED: Added u.requiresPasswordChange to match the 5-argument UserResponse constructor!
    @Query("SELECT new com.rupee.dto.response.UserResponse(u.id, u.identifier, u.role, u.consultantId, u.requiresPasswordChange) FROM User u")
    List<UserResponse> findAllUserResponses();

    long countByRole(Role role);
}