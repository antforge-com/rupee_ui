package com.rupee.controller;

import com.rupee.dto.request.OfferRequest;
import com.rupee.dto.response.OfferResponse;
import com.rupee.enums.OfferStatus; // ✅ NEW IMPORT
import com.rupee.service.OfferService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/offers")
@RequiredArgsConstructor
public class OfferController {

    private final OfferService offerService;

    // CREATE (Admin or Consultant)
    @PostMapping
    public ResponseEntity<OfferResponse> createOffer(@Valid @RequestBody OfferRequest request) {
        return new ResponseEntity<>(offerService.createOffer(request), HttpStatus.CREATED);
    }

    // UPDATE
    @PutMapping("/{id:[0-9]+}")
    public ResponseEntity<OfferResponse> updateOffer(@PathVariable Long id, @Valid @RequestBody OfferRequest request) {
        return ResponseEntity.ok(offerService.updateOffer(id, request));
    }

    // ADMIN ONLY: Approve or Reject an offer
    @PutMapping("/{id:[0-9]+}/status")
    public ResponseEntity<OfferResponse> updateOfferStatus(
            @PathVariable Long id,
            @RequestParam OfferStatus status) {
        return ResponseEntity.ok(offerService.updateOfferStatus(id, status));
    }

    // DELETE
    @DeleteMapping("/{id:[0-9]+}")
    public ResponseEntity<Void> deleteOffer(@PathVariable Long id) {
        offerService.deleteOffer(id);
        return ResponseEntity.noContent().build();
    }

    // GET ALL (For Admin Dashboard)
    @GetMapping("/admin")
    public ResponseEntity<List<OfferResponse>> getAllOffersForAdmin() {
        return ResponseEntity.ok(offerService.getAllOffersForAdmin());
    }

    // GET MINE (For Consultant Dashboard)
    @GetMapping("/my-offers")
    public ResponseEntity<List<OfferResponse>> getMyOffers() {
        return ResponseEntity.ok(offerService.getOffersForConsultantDashboard());
    }

    // ==========================================
    // PUBLIC: Get ALL active/approved offers for the Home Page
    // ==========================================
    @GetMapping("/public")
    public ResponseEntity<List<OfferResponse>> getPublicHomeOffers() {
        return ResponseEntity.ok(offerService.getPublicHomeOffers());
    }

    // SECURED: Get valid offers for a specific checkout screen (Filters out offers the user already used)
    @GetMapping("/checkout")
    public ResponseEntity<List<OfferResponse>> getActiveOffersForCheckout(@RequestParam(required = false) Long consultantId) {
        return ResponseEntity.ok(offerService.getActiveOffersForCheckout(consultantId));
    }
}