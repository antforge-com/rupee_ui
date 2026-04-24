package com.rupee.entity;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "incomes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Income {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId; // Loose coupling to User table

    @Column(name = "income_type", nullable = false, length = 50)
    private String incomeType;

    @Column(name = "income_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal incomeAmount;
}