package com.rupee.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "system_configs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SystemConfig {

    @Id
    @Column(name = "config_key", nullable = false, unique = true, length = 50)
    private String key; // e.g., "AUTO_RESPONDER_ENABLED"

    @Column(name = "config_value", nullable = false, length = 1000)
    private String value;
}