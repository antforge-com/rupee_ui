package com.rupee.repository;

import com.rupee.entity.Offer;
import com.rupee.enums.OfferStatus; // ADDED THIS IMPORT
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface OfferRepository extends JpaRepository<Offer, Long> {

    // For a consultant viewing their own offers (Shows Pending, Approved, and Rejected)
    List<Offer> findByConsultantId(Long consultantId);

    // For the public checkout page (Fetches global Admin offers that are Active AND Approved)
    List<Offer> findByIsActiveTrueAndStatusAndConsultantIdIsNull(OfferStatus status);

    // For the public checkout page (Fetches specific Consultant offers that are Active AND Approved)
    List<Offer> findByIsActiveTrueAndStatusAndConsultantId(OfferStatus status, Long consultantId);

    List<Offer> findByIsActiveTrueAndStatus(OfferStatus status);
}