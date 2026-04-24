package com.rupee.repository;

import com.rupee.entity.SystemConfig;
// ✅ FIXED: Changed from jakarta.persistence to org.springframework
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SystemConfigRepository extends JpaRepository<SystemConfig, String> {

    @Cacheable("systemConfigs") // Now this magic annotation will work perfectly!
    Optional<SystemConfig> findByKey(String key);
}