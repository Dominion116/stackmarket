;; NFT Trait Definition (SIP-009 style)
;; This trait must be implemented by any NFT contract that wants to work with the marketplace

(define-trait nft-trait
  (
    ;; Transfer ownership of a token
    (transfer (uint principal principal) (response bool uint))
    
    ;; Get the owner of a token
    (get-owner (uint) (response (optional principal) uint))
  )
)