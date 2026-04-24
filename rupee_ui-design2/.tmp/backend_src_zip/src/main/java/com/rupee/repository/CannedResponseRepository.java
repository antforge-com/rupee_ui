package com.rupee.repository;

import com.rupee.entity.CannedResponse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CannedResponseRepository extends JpaRepository<CannedResponse, Long> {
    List<CannedResponse> findByCategory(String category);
}