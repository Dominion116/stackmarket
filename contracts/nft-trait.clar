(define-trait nft-trait
  (
    (transfer (token-id uint) (sender principal) (recipient principal) (response bool uint))
    (get-owner (token-id uint) (response (optional principal) uint))
  )
)
