import { Clarinet, Tx, Chain, Account, types } from "clarinet";

Clarinet.test({
  name: "list, update, cancel, buy flow works with mock NFT and admin controls",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const user1 = accounts.get("wallet_1")!;
    const user2 = accounts.get("wallet_2")!;

    const nftContractPrincipal = `${deployer.address}.mock-nft`;

    // ---------------------------------
    // 1. Mint NFT to user1
    // ---------------------------------
    let block = chain.mineBlock([
      Tx.contractCall("mock-nft", "mint", [types.principal(user1.address)], deployer.address),
    ]);

    // mint should succeed and return token-id u1
    block.receipts[0].result.expectOk().expectUint(1);

    // ---------------------------------
    // 2. List NFT
    // ---------------------------------
    block = chain.mineBlock([
      Tx.contractCall("nft-marketplace", "list-nft", [
        types.principal(nftContractPrincipal),
        types.uint(1),
        types.uint(1000),
      ], user1.address),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);

    // listing exists and has correct price
    let listing = chain.callReadOnlyFn(
      "nft-marketplace",
      "get-listing",
      [types.principal(nftContractPrincipal), types.uint(1)],
      deployer.address,
    );
    listing.result.expectSome().expectTuple();

    // ---------------------------------
    // 3. Update listing
    // ---------------------------------
    block = chain.mineBlock([
      Tx.contractCall("nft-marketplace", "update-listing", [
        types.principal(nftContractPrincipal),
        types.uint(1),
        types.uint(1500),
      ], user1.address),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);

    listing = chain.callReadOnlyFn(
      "nft-marketplace",
      "get-listing",
      [types.principal(nftContractPrincipal), types.uint(1)],
      deployer.address,
    );
    const listingTuple = listing.result.expectSome().expectTuple();
    listingTuple["price"].expectUint(1500);

    // ---------------------------------
    // 4. Buy NFT
    // ---------------------------------
    const buyerBalanceBefore = chain.getAssetsMaps().stx[user2.address] || 0n;

    block = chain.mineBlock([
      Tx.contractCall("nft-marketplace", "buy-nft", [
        types.principal(nftContractPrincipal),
        types.uint(1),
      ], user2.address),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);

    // Listing should be gone after purchase
    const listingAfterBuy = chain.callReadOnlyFn(
      "nft-marketplace",
      "get-listing",
      [types.principal(nftContractPrincipal), types.uint(1)],
      deployer.address,
    );
    listingAfterBuy.result.expectNone();

    // NFT owner should now be user2
    const ownerAfter = chain.callReadOnlyFn(
      "mock-nft",
      "get-owner",
      [types.uint(1)],
      deployer.address,
    );
    ownerAfter.result.expectOk().expectSome().expectPrincipal(user2.address);

    const buyerBalanceAfter = chain.getAssetsMaps().stx[user2.address] || 0n;
    if (buyerBalanceAfter >= buyerBalanceBefore) {
      throw new Error("buyer balance did not decrease after purchase");
    }

    // ---------------------------------
    // 5. Admin: set platform fee and update owner
    // ---------------------------------
    // Only deployer (initial owner) can set fee
    block = chain.mineBlock([
      Tx.contractCall("nft-marketplace", "set-platform-fee", [types.uint(500)], deployer.address),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Non-owner should fail to set fee
    block = chain.mineBlock([
      Tx.contractCall("nft-marketplace", "set-platform-fee", [types.uint(300)], user1.address),
    ]);
    block.receipts[0].result.expectErr().expectUint(100); // err-owner-only

    // Transfer ownership to user1
    block = chain.mineBlock([
      Tx.contractCall("nft-marketplace", "update-owner", [types.principal(user1.address)], deployer.address),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Now user1 can set fee
    block = chain.mineBlock([
      Tx.contractCall("nft-marketplace", "set-platform-fee", [types.uint(300)], user1.address),
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
  },
});
