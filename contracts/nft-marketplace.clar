;; NFT Marketplace Contract
;; A simple marketplace for listing and buying NFTs (SIP-009 style)

(use-trait nft-trait .nft-trait.nft-trait)

;; ---------------------------------------
;; Constants & Errors
;; ---------------------------------------

(define-data-var contract-owner principal tx-sender)

(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-already-listed (err u102))
(define-constant err-not-listed (err u103))
(define-constant err-insufficient-payment (err u104))
(define-constant err-unauthorized (err u105))
(define-constant err-invalid-price (err u106))
(define-constant err-fee-too-high (err u107))
(define-constant err-nft-not-owned (err u108))
(define-constant err-nft-transfer-failed (err u109))

;; ---------------------------------------
;; Data Variables & Maps
;; ---------------------------------------

;; Platform fee in basis points (e.g. 250 = 2.5%)
(define-data-var platform-fee-percentage uint u250)

(define-map listings
  { nft-contract: principal, token-id: uint }
  { seller: principal, price: uint, listed-at: uint }
)

(define-map user-sales-count principal uint)

;; ---------------------------------------
;; Read-only functions
;; ---------------------------------------

(define-read-only (get-listing (nft-contract principal) (token-id uint))
  (map-get? listings { nft-contract: nft-contract, token-id: token-id })
)

(define-read-only (get-platform-fee)
  (var-get platform-fee-percentage)
)

(define-read-only (calculate-fee (price uint))
  (/ (* price (var-get platform-fee-percentage)) u10000)
)

(define-read-only (get-user-sales (user principal))
  (default-to u0 (map-get? user-sales-count user))
)

;; ---------------------------------------
;; Internal helpers
;; ---------------------------------------

(define-private (is-nft-owner
  (nft-contract <nft-trait>)
  (token-id uint)
  (owner principal)
)
  (match (contract-call? nft-contract get-owner token-id)
    ok-val
      (match ok-val
        nft-owner (is-eq nft-owner owner)
        false)
    err-val false
  )
)

;; ---------------------------------------
;; Public functions
;; ---------------------------------------

(define-public (list-nft (nft-contract <nft-trait>) (token-id uint) (price uint))
  (let
    (
      (listing-key { nft-contract: (contract-of nft-contract), token-id: token-id })
      (existing-listing (map-get? listings listing-key))
    )
    (asserts! (is-none existing-listing) err-already-listed)
    (asserts! (> price u0) err-invalid-price)
    (asserts! (is-nft-owner nft-contract token-id tx-sender) err-nft-not-owned)

    (map-set listings
      listing-key
      {
        seller: tx-sender,
        price: price,
        listed-at: block-height
      }
    )
    (ok true)
  )
)

(define-public (update-listing (nft-contract <nft-trait>) (token-id uint) (new-price uint))
  (let
    (
      (listing-key { nft-contract: (contract-of nft-contract), token-id: token-id })
      (listing (unwrap! (map-get? listings listing-key) err-not-listed))
    )
    (asserts! (is-eq tx-sender (get seller listing)) err-unauthorized)
    (asserts! (> new-price u0) err-invalid-price)

    (map-set listings
      listing-key
      (merge listing { price: new-price })
    )
    (ok true)
  )
)

(define-public (cancel-listing (nft-contract <nft-trait>) (token-id uint))
  (let
    (
      (listing-key { nft-contract: (contract-of nft-contract), token-id: token-id })
      (listing (unwrap! (map-get? listings listing-key) err-not-listed))
    )
    (asserts! (is-eq tx-sender (get seller listing)) err-unauthorized)

    (map-delete listings listing-key)
    (ok true)
  )
)

(define-public (buy-nft (nft-contract <nft-trait>) (token-id uint))
  (let
    (
      (listing-key { nft-contract: (contract-of nft-contract), token-id: token-id })
      (listing (unwrap! (map-get? listings listing-key) err-not-listed))
      (price (get price listing))
      (seller (get seller listing))
      (fee (calculate-fee price))
      (seller-proceeds (- price fee))
    )
    (asserts! (not (is-eq tx-sender seller)) err-unauthorized)

    ;; Transfer payment to seller
    (try! (stx-transfer? seller-proceeds tx-sender seller))
    
    ;; Transfer fee to contract owner
    (try! (stx-transfer? fee tx-sender (var-get contract-owner)))

    ;; Transfer NFT from seller to buyer (tx-sender)
    (unwrap! (contract-call? nft-contract transfer token-id seller tx-sender) err-nft-transfer-failed)
    
    ;; Update seller stats
    (map-set user-sales-count
      seller
      (+ (get-user-sales seller) u1)
    )
    
    ;; Remove listing
    (map-delete listings listing-key)
    
    (ok true)
  )
)

;; ---------------------------------------
;; Admin functions
;; ---------------------------------------

(define-public (set-platform-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) err-owner-only)
    (asserts! (<= new-fee u1000) err-fee-too-high)
    (var-set platform-fee-percentage new-fee)
    (ok true)
  )
)

(define-public (update-owner (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) err-owner-only)
    (var-set contract-owner new-owner)
    (ok true)
  )
)