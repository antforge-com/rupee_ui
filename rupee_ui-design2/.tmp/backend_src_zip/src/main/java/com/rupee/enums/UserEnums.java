package com.rupee.enums;

public class UserEnums {
    public enum Role {
        GUEST,
        MEMBER,
        SUBSCRIBER, // ✅ New role for paid users
        CONSULTANT,
        ADMIN
    }
}