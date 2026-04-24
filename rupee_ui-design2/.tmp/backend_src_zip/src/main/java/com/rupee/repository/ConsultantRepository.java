package com.rupee.repository;

import com.rupee.entity.Consultant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ConsultantRepository extends JpaRepository<Consultant, Long> {

    boolean existsByNameIgnoreCaseAndDesignationIgnoreCase(String name, String designation);

    boolean existsByNameIgnoreCaseAndDesignationIgnoreCaseAndIdNot(String name, String designation, Long id);
}