package com.rupee.repository;

import com.rupee.entity.Question;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QuestionRepository extends JpaRepository<Question, Long> {

    // Fetch ALL active questions globally, since they are now standalone
    List<Question> findByIsActiveTrue();

}