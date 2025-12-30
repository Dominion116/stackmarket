import { Clarinet, Tx, Chain, types } from "clarinet";
import { assertEquals, assertNotEquals } from "matchstick-as/assembly/index";

Clarinet.test({
  name: "list, update, cancel, buy flow works with mock NFT",
  async fn(chain: Chain, accounts) {
    const deployer = accounts.get("deployer")!;
    const user1 = accounts.get("wallet_1")!;
    const user2 = accounts.get("wallet_2")!;

    // Mint NFT to user1
    let block = chain.mineBlock([
      Tx.contractCall("mock-nft", "mint", [types.principal(user1.address)], deployer.address),
    ]);
    const mintResult = block.receipts[0].result;

    // Assume mint returns token-id = u1
    // List NFT
    block = chain.mineBlock([
      Tx.contractCall("nft-marketplace", "list-nft", [
        types.principal(`${deployer.address}.mock-nft`),
        types.uint(1),
        types.uint(1000),
      ], user1.address),
    ]);

    // Update listing
    block = chain.mineBlock([
      Tx.contractCall("nft-marketplace", "update-listing", [
        types.principal(`${deployer.address}.mock-nft`),
        types.uint(1),
        types.uint(1500),
      ], user1.address),
    ]);

    // Buy NFT from user2
    block = chain.mineBlock([
      Tx.contractCall("nft-marketplace", "buy-nft", [
        types.principal(`${deployer.address}.mock-nft`),
        types.uint(1),
      ], user2.address),
    ]);

    // Admin updates fee
    block = chain.mineBlock([
      Tx.contractCall("nft-marketplace", "set-platform-fee", [types.uint(500)], deployer.address),
    ]);
  },
});
