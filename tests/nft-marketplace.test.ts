import { describe, it, expect, beforeEach } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";
import { initSimnet } from "@hirosystems/clarinet-sdk";

const simnet = await initSimnet();

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const user1 = accounts.get("wallet_1")!;
const user2 = accounts.get("wallet_2")!;

describe("NFT Marketplace Tests", () => {
  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  it("list, update, cancel, buy flow works with mock NFT and admin controls", () => {
    const nftContractPrincipal = `${deployer}.mock-nft`;

    // ---------------------------------
    // 1. Mint NFT to user1
    // ---------------------------------
    let response = simnet.callPublicFn(
      "mock-nft",
      "mint",
      [Cl.principal(user1)],
      deployer
    );
    expect(response.result).toStrictEqual(Cl.ok(Cl.uint(1)));

    // ---------------------------------
    // 2. List NFT
    // ---------------------------------
    response = simnet.callPublicFn(
      "nft-marketplace",
      "list-nft",
      [Cl.principal(nftContractPrincipal), Cl.uint(1), Cl.uint(1000)],
      user1
    );
    expect(response.result).toStrictEqual(Cl.ok(Cl.bool(true)));

    // listing exists and has correct price
    let listing = simnet.callReadOnlyFn(
      "nft-marketplace",
      "get-listing",
      [Cl.principal(nftContractPrincipal), Cl.uint(1)],
      deployer
    );
    expect(listing.result.type).toBe(ClarityType.OptionalSome);

    // ---------------------------------
    // 3. Update listing
    // ---------------------------------
    response = simnet.callPublicFn(
      "nft-marketplace",
      "update-listing",
      [Cl.principal(nftContractPrincipal), Cl.uint(1), Cl.uint(1500)],
      user1
    );
    expect(response.result).toStrictEqual(Cl.ok(Cl.bool(true)));

    listing = simnet.callReadOnlyFn(
      "nft-marketplace",
      "get-listing",
      [Cl.principal(nftContractPrincipal), Cl.uint(1)],
      deployer
    );
    expect(listing.result.type).toBe(ClarityType.OptionalSome);

    // ---------------------------------
    // 4. Buy NFT
    // ---------------------------------
    const buyerBalanceBefore = simnet.getAssetsMap().get("STX")?.get(user2) || 0n;

    response = simnet.callPublicFn(
      "nft-marketplace",
      "buy-nft",
      [Cl.principal(nftContractPrincipal), Cl.uint(1)],
      user2
    );
    expect(response.result).toStrictEqual(Cl.ok(Cl.bool(true)));

    // Listing should be gone after purchase
    const listingAfterBuy = simnet.callReadOnlyFn(
      "nft-marketplace",
      "get-listing",
      [Cl.principal(nftContractPrincipal), Cl.uint(1)],
      deployer
    );
    expect(listingAfterBuy.result.type).toBe(ClarityType.OptionalNone);

    // NFT owner should now be user2
    const ownerAfter = simnet.callReadOnlyFn(
      "mock-nft",
      "get-owner",
      [Cl.uint(1)],
      deployer
    );
    expect(ownerAfter.result).toStrictEqual(Cl.ok(Cl.some(Cl.principal(user2))));

    const buyerBalanceAfter = simnet.getAssetsMap().get("STX")?.get(user2) || 0n;
    expect(buyerBalanceAfter).toBeLessThan(buyerBalanceBefore);

    // ---------------------------------
    // 5. Admin: set platform fee and update owner
    // ---------------------------------
    // Only deployer (initial owner) can set fee
    response = simnet.callPublicFn(
      "nft-marketplace",
      "set-platform-fee",
      [Cl.uint(500)],
      deployer
    );
    expect(response.result).toStrictEqual(Cl.ok(Cl.bool(true)));

    // Non-owner should fail to set fee
    response = simnet.callPublicFn(
      "nft-marketplace",
      "set-platform-fee",
      [Cl.uint(300)],
      user1
    );
    expect(response.result).toStrictEqual(Cl.error(Cl.uint(100))); // err-owner-only

    // Transfer ownership to user1
    response = simnet.callPublicFn(
      "nft-marketplace",
      "update-owner",
      [Cl.principal(user1)],
      deployer
    );
    expect(response.result).toStrictEqual(Cl.ok(Cl.bool(true)));

    // Now user1 can set fee
    response = simnet.callPublicFn(
      "nft-marketplace",
      "set-platform-fee",
      [Cl.uint(300)],
      user1
    );
    expect(response.result).toStrictEqual(Cl.ok(Cl.bool(true)));
  });

  it("cannot list NFT you don't own", () => {
    const nftContractPrincipal = `${deployer}.mock-nft`;

    // Mint NFT to user1
    simnet.callPublicFn("mock-nft", "mint", [Cl.principal(user1)], deployer);

    // user2 tries to list user1's NFT - should fail
    const response = simnet.callPublicFn(
      "nft-marketplace",
      "list-nft",
      [Cl.principal(nftContractPrincipal), Cl.uint(1), Cl.uint(1000)],
      user2
    );
    expect(response.result).toStrictEqual(Cl.error(Cl.uint(108))); // err-nft-not-owned
  });

  it("cannot list same NFT twice", () => {
    const nftContractPrincipal = `${deployer}.mock-nft`;

    // Mint and list NFT
    simnet.callPublicFn("mock-nft", "mint", [Cl.principal(user1)], deployer);
    simnet.callPublicFn(
      "nft-marketplace",
      "list-nft",
      [Cl.principal(nftContractPrincipal), Cl.uint(1), Cl.uint(1000)],
      user1
    );

    // Try to list again - should fail
    const response = simnet.callPublicFn(
      "nft-marketplace",
      "list-nft",
      [Cl.principal(nftContractPrincipal), Cl.uint(1), Cl.uint(2000)],
      user1
    );
    expect(response.result).toStrictEqual(Cl.error(Cl.uint(102))); // err-already-listed
  });

  it("cannot update listing price to zero or as non-seller", () => {
    const nftContractPrincipal = `${deployer}.mock-nft`;

    // Mint and list NFT
    simnet.callPublicFn("mock-nft", "mint", [Cl.principal(user1)], deployer);
    simnet.callPublicFn(
      "nft-marketplace",
      "list-nft",
      [Cl.principal(nftContractPrincipal), Cl.uint(1), Cl.uint(1000)],
      user1
    );

    // Try to update to zero price - should fail
    let response = simnet.callPublicFn(
      "nft-marketplace",
      "update-listing",
      [Cl.principal(nftContractPrincipal), Cl.uint(1), Cl.uint(0)],
      user1
    );
    expect(response.result).toStrictEqual(Cl.error(Cl.uint(106))); // err-invalid-price

    // user2 tries to update user1's listing - should fail
    response = simnet.callPublicFn(
      "nft-marketplace",
      "update-listing",
      [Cl.principal(nftContractPrincipal), Cl.uint(1), Cl.uint(2000)],
      user2
    );
    expect(response.result).toStrictEqual(Cl.error(Cl.uint(105))); // err-unauthorized
  });

  it("seller cannot buy their own NFT", () => {
    const nftContractPrincipal = `${deployer}.mock-nft`;

    // Mint and list NFT
    simnet.callPublicFn("mock-nft", "mint", [Cl.principal(user1)], deployer);
    simnet.callPublicFn(
      "nft-marketplace",
      "list-nft",
      [Cl.principal(nftContractPrincipal), Cl.uint(1), Cl.uint(1000)],
      user1
    );

    // user1 tries to buy their own NFT - should fail
    const response = simnet.callPublicFn(
      "nft-marketplace",
      "buy-nft",
      [Cl.principal(nftContractPrincipal), Cl.uint(1)],
      user1
    );
    expect(response.result).toStrictEqual(Cl.error(Cl.uint(105))); // err-unauthorized
  });

  it("platform fee cannot exceed 10%", () => {
    // Try to set fee higher than 1000 basis points (10%)
    const response = simnet.callPublicFn(
      "nft-marketplace",
      "set-platform-fee",
      [Cl.uint(1001)],
      deployer
    );
    expect(response.result).toStrictEqual(Cl.error(Cl.uint(107))); // err-fee-too-high
  });

  it("sales count increments correctly", () => {
    const nftContractPrincipal = `${deployer}.mock-nft`;

    // Initial sales count should be 0
    let salesCount = simnet.callReadOnlyFn(
      "nft-marketplace",
      "get-user-sales",
      [Cl.principal(user1)],
      deployer
    );
    expect(salesCount.result).toStrictEqual(Cl.uint(0));

    // Mint, list, and sell first NFT
    simnet.callPublicFn("mock-nft", "mint", [Cl.principal(user1)], deployer);
    simnet.callPublicFn(
      "nft-marketplace",
      "list-nft",
      [Cl.principal(nftContractPrincipal), Cl.uint(1), Cl.uint(1000)],
      user1
    );
    simnet.callPublicFn(
      "nft-marketplace",
      "buy-nft",
      [Cl.principal(nftContractPrincipal), Cl.uint(1)],
      user2
    );

    // Sales count should now be 1
    salesCount = simnet.callReadOnlyFn(
      "nft-marketplace",
      "get-user-sales",
      [Cl.principal(user1)],
      deployer
    );
    expect(salesCount.result).toStrictEqual(Cl.uint(1));

    // Mint, list, and sell second NFT
    simnet.callPublicFn("mock-nft", "mint", [Cl.principal(user1)], deployer);
    simnet.callPublicFn(
      "nft-marketplace",
      "list-nft",
      [Cl.principal(nftContractPrincipal), Cl.uint(2), Cl.uint(1500)],
      user1
    );
    simnet.callPublicFn(
      "nft-marketplace",
      "buy-nft",
      [Cl.principal(nftContractPrincipal), Cl.uint(2)],
      user2
    );

    // Sales count should now be 2
    salesCount = simnet.callReadOnlyFn(
      "nft-marketplace",
      "get-user-sales",
      [Cl.principal(user1)],
      deployer
    );
    expect(salesCount.result).toStrictEqual(Cl.uint(2));
  });
});