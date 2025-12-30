;; NFT Marketplace Contract
;; A simple marketplace for listing and buying NFTs (SIP-009 style)

;; ---------------------------------------
;; Constants & Errors
;; ---------------------------------------

;; Owner set to deployer at contract publish time, but stored as data-var
;; so it can be transferred later if needed.
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

;; Verify that the given principal currently owns the NFT.
;; This is written for a typical SIP-009 style NFT contract that exposes
;;   (get-owner (token-id uint)) -> (response (optional principal) uint)
;; If your NFT contract uses a different interface, adapt this call.
(define-read-only (is-nft-owner
  (nft-contract principal)
  (token-id uint)
  (owner principal)
)
  (match (contract-call? nft-contract get-owner token-id)
    ok-val
      (match ok-val
        nft-owner (is-eq (default-to owner nft-owner) owner)
      )
    err-val false
  )
)

;; ---------------------------------------
;; Public functions
;; ---------------------------------------

(define-public (list-nft (nft-contract principal) (token-id uint) (price uint))
  (let
    (
      (listing-key { nft-contract: nft-contract, token-id: token-id })
      (existing-listing (map-get? listings listing-key))
    )
    ;; Check if already listed
    (asserts! (is-none existing-listing) err-already-listed)

    ;; Price must be positive
    (asserts! (> price u0) err-invalid-price)

    ;; Verify caller owns the NFT via the NFT contract
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

(define-public (update-listing (nft-contract principal) (token-id uint) (new-price uint))
  (let
    (
      (listing-key { nft-contract: nft-contract, token-id: token-id })
      (listing (unwrap! (map-get? listings listing-key) err-not-listed))
    )
    ;; Only seller can update
    (asserts! (is-eq tx-sender (get seller listing)) err-unauthorized)
    (asserts! (> new-price u0) err-invalid-price)

    (map-set listings
      listing-key
      (merge listing { price: new-price })
    )
    (ok true)
  )
)

(define-public (cancel-listing (nft-contract principal) (token-id uint))
  (let
    (
      (listing-key { nft-contract: nft-contract, token-id: token-id })
      (listing (unwrap! (map-get? listings listing-key) err-not-listed))
    )
    ;; Only seller can cancel
    (asserts! (is-eq tx-sender (get seller listing)) err-unauthorized)

    (map-delete listings listing-key)
    (ok true)
  )
)

(define-public (buy-nft (nft-contract principal) (token-id uint))
  (let
    (
      (listing-key { nft-contract: nft-contract, token-id: token-id })
      (listing (unwrap! (map-get? listings listing-key) err-not-listed))
      (price (get price listing))
      (seller (get seller listing))
      (fee (calculate-fee price))
      (seller-proceeds (- price fee))
    )
    ;; Prevent seller from buying own NFT
    (asserts! (not (is-eq tx-sender seller)) err-unauthorized)

    ;; Transfer STX from buyer to seller (minus fee)
    (try! (stx-transfer? seller-proceeds tx-sender seller))

    ;; Transfer platform fee to contract owner
    (try! (stx-transfer? fee tx-sender contract-owner))

    ;; Verify seller still owns the NFT before transfer
    (asserts! (is-nft-owner nft-contract token-id seller) err-nft-not-owned)

    ;; Transfer NFT ownership via contract call.
    ;; Assumes NFT contract exposes:
    ;;   (transfer (token-id uint) (sender principal) (recipient principal))
    (let ((nft-transfer-resp (contract-call? nft-contract transfer token-id seller tx-sender)) )
      (match nft-transfer-resp
        nft-ok
          (begin
            ;; Update seller's sales count
            (map-set user-sales-count
              seller
              (+ (get-user-sales seller) u1)
            )

            ;; Remove listing
            (map-delete listings listing-key)

            (ok true)
          )
        nft-err (err-nft-transfer-failed)
      )
    )
  )
)

;; ---------------------------------------
;; Admin functions
;; ---------------------------------------

(define-public (set-platform-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) err-owner-only)
    (asserts! (<= new-fee u1000) err-fee-too-high) ;; Max 10%
    (var-set platform-fee-percentage new-fee)
    (ok true)
  )
)

;; Transfer contract ownership to a new principal
(define-public (update-owner (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) err-owner-only)
    (var-set contract-owner new-owner)
    (ok true)
  )
)
