;; Mock SIP-009-style NFT contract for testing the marketplace

(define-trait sip009-nft-trait
  ((transfer (token-id uint) (sender principal) (recipient principal)) (response bool uint))
  ((get-owner (token-id uint)) (response (optional principal) uint))
)

(impl-trait .sip009-nft-trait)

(define-data-var next-id uint u1)
(define-map owners uint principal)

(define-public (mint (recipient principal))
  (let ((id (var-get next-id)))
    (var-set next-id (+ id u1))
    (map-set owners id recipient)
    (ok id)
  )
)

(define-read-only (get-owner (token-id uint))
  (ok (map-get? owners token-id))
)

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (let ((current (map-get? owners token-id)))
    (match current
      owner-principal
        (begin
          (asserts! (is-eq sender owner-principal) (err u100))
          (map-set owners token-id recipient)
          (ok true)
        )
      (err u101)
    )
  )
)
