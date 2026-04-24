package com.rupee.service;

import com.rupee.dto.request.OfferRequest;
import com.rupee.dto.response.OfferResponse;
import com.rupee.entity.Offer;
import com.rupee.entity.User;
import com.rupee.enums.OfferStatus;
import com.rupee.enums.UserEnums.Role;
import com.rupee.repository.BookingRepository; // ✅ ADDED IMPORT
import com.rupee.repository.ConsultantRepository;
import com.rupee.repository.OfferRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class OfferService {

    private final OfferRepository offerRepository;
    private final SecurityService securityService;
    private final BookingRepository bookingRepository; // ✅ ADDED INJECTION
    private final ConsultantRepository consultantRepository; // ✅ ADD THIS INJECTION

    private static final String OFFER_NOT_FOUND_MSG = "Offer not found";

    @Transactional
    public OfferResponse createOffer(OfferRequest request) {
        User currentUser = securityService.getCurrentUser();
        Long assignedConsultantId = determineConsultantId(currentUser, request.getConsultantId());

        Offer offer = new Offer();
        updateOfferFields(offer, request, assignedConsultantId);

        // Auto-approve Admin offers, force Consultant offers to PENDING
        if (currentUser.getRole() == Role.ADMIN) {
            offer.setStatus(OfferStatus.APPROVED);
        } else {
            offer.setStatus(OfferStatus.PENDING);
        }

        return mapToResponse(offerRepository.save(offer));
    }

    @Transactional
    public OfferResponse updateOffer(Long id, OfferRequest request) {
        Offer offer = offerRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, OFFER_NOT_FOUND_MSG));

        User currentUser = securityService.getCurrentUser();

        // Security Check: If Consultant, they can only edit their own offers
        if (currentUser.getRole() == Role.CONSULTANT && !currentUser.getConsultantId().equals(offer.getConsultantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only edit your own offers.");
        }

        Long assignedConsultantId = determineConsultantId(currentUser, request.getConsultantId());
        updateOfferFields(offer, request, assignedConsultantId);

        // If a Consultant edits an offer, it goes back to PENDING so they can't sneak in changes.
        if (currentUser.getRole() == Role.CONSULTANT) {
            offer.setStatus(OfferStatus.PENDING);
        }

        return mapToResponse(offerRepository.save(offer));
    }

    // Endpoint logic for Admin to Approve/Reject
    @Transactional
    public OfferResponse updateOfferStatus(Long id, OfferStatus newStatus) {
        User currentUser = securityService.getCurrentUser();
        if (currentUser.getRole() != Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only Admins can approve or reject offers.");
        }

        Offer offer = offerRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, OFFER_NOT_FOUND_MSG));

        offer.setStatus(newStatus);
        return mapToResponse(offerRepository.save(offer));
    }

    @Transactional
    public void deleteOffer(Long id) {
        Offer offer = offerRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, OFFER_NOT_FOUND_MSG));

        User currentUser = securityService.getCurrentUser();
        if (currentUser.getRole() == Role.CONSULTANT && !currentUser.getConsultantId().equals(offer.getConsultantId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only delete your own offers.");
        }

        offerRepository.delete(offer);
    }

    // --- FETCH METHODS ---

    @Transactional(readOnly = true)
    public List<OfferResponse> getAllOffersForAdmin() {
        return offerRepository.findAll().stream().map(this::mapToResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<OfferResponse> getOffersForConsultantDashboard() {
        User currentUser = securityService.getCurrentUser();
        if (currentUser.getRole() != Role.CONSULTANT) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only consultants can view this.");
        }
        return offerRepository.findByConsultantId(currentUser.getConsultantId())
                .stream().map(this::mapToResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<OfferResponse> getPublicHomeOffers() {
        LocalDateTime now = LocalDateTime.now();

        return offerRepository.findByIsActiveTrueAndStatus(OfferStatus.APPROVED)
                .stream()
                .filter(o -> {
                    // ✅ 1. NULL SAFETY: If no dates are set, treat it as a "Permanent" offer
                    if (o.getValidFrom() == null || o.getValidTo() == null) {
                        return true;
                    }
                    // ✅ 2. STRICT RANGE: Otherwise, ensure right now falls inside the active window
                    return o.getValidFrom().isBefore(now) && o.getValidTo().isAfter(now);
                })
                .map(this::mapToResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<OfferResponse> getActiveOffersForCheckout(Long consultantId) {
        // ✅ Get the current user so we can check their history
        User currentUser = securityService.getCurrentUser();
        Long userId = currentUser.getId();

        // Returns both Global Admin Offers AND specific Consultant Offers that are currently active and not expired
        List<Offer> activeOffers = new ArrayList<>();

        // Pass OfferStatus.APPROVED to the repository calls
        activeOffers.addAll(offerRepository.findByIsActiveTrueAndStatusAndConsultantIdIsNull(OfferStatus.APPROVED));

        if (consultantId != null) {
            activeOffers.addAll(offerRepository.findByIsActiveTrueAndStatusAndConsultantId(OfferStatus.APPROVED, consultantId));
        }

        LocalDateTime now = LocalDateTime.now();
        return activeOffers.stream()
                // 1. Keep only offers that are within the valid date range
                .filter(o -> o.getValidFrom().isBefore(now) && o.getValidTo().isAfter(now))
                // ✅ 2. NEW UX FIX: Filter OUT any offers this specific user has already used
                // (It still allows them to see the offer if their previous attempt was CANCELLED)
                .filter(o -> !bookingRepository.existsByUserIdAndOfferIdAndBookingStatusNot(userId, o.getId(), com.rupee.enums.BookingEnums.BookingStatus.CANCELLED))
                .map(this::mapToResponse)
                .toList();
    }

    // ==========================================
    // ✅ NEW: Validate Discount Logic
    // ==========================================
    private void validateDiscount(String discountStr) {
        if (discountStr == null || discountStr.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Discount cannot be empty");
        }
        try {
            if (discountStr.contains("%")) {
                double percentage = Double.parseDouble(discountStr.replace("%", "").trim());
                if (percentage <= 0 || percentage > 100) { // ✅ Changed >= to >
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Percentage discount must be greater than 0 and up to 100%");
                }
            } else {
                double flatAmount = Double.parseDouble(discountStr.trim());
                if (flatAmount <= 0) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Flat discount amount must be greater than 0");
                }
            }
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid discount format. Use a number or a percentage (e.g., '500' or '20%')");
        }
    }

    // --- HELPER METHODS ---

    private Long determineConsultantId(User user, Long requestedConsultantId) {
        // 1. Determine the target ID cleanly based on the user's role
        Long targetId = switch (user.getRole()) {
            case ADMIN -> requestedConsultantId;         // Admins can assign anyone (or null for global)
            case CONSULTANT -> user.getConsultantId();   // Consultants are forced to use their own ID
            default -> throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only Admins and Consultants can create offers.");
        };

        // 2. Safety Check: If an ID was determined, ensure it actually exists in the database
        if (targetId != null && !consultantRepository.existsById(targetId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "The specified Consultant ID does not exist.");
        }

        return targetId;
    }

    private void updateOfferFields(Offer offer, OfferRequest request, Long consultantId) {

        validateDiscount(request.getDiscount()); // ✅ ADD THIS LINE

        offer.setTitle(request.getTitle());
        offer.setDescription(request.getDescription());
        offer.setDiscount(request.getDiscount());
        offer.setValidFrom(request.getValidFrom());
        offer.setValidTo(request.getValidTo());
        offer.setActive(request.isActive());
        offer.setConsultantId(consultantId);
    }

    private OfferResponse mapToResponse(Offer offer) {
        return OfferResponse.builder()
                .id(offer.getId())
                .title(offer.getTitle())
                .description(offer.getDescription())
                .discount(offer.getDiscount())
                .validFrom(offer.getValidFrom())
                .validTo(offer.getValidTo())
                .isActive(offer.isActive())
                .consultantId(offer.getConsultantId())
                .status(offer.getStatus()) // Map the status to the response
                .build();
    }
}