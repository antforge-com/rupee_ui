package com.rupee.repository;

import com.rupee.entity.StaticContent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface StaticContentRepository extends JpaRepository<StaticContent, Long> {

    // Custom method to fetch the HTML by its type (e.g., "PRIVACY_POLICY")
    Optional<StaticContent> findByContentType(String contentType);
}