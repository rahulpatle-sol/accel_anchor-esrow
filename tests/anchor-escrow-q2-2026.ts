import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { AnchorEscrowQ22026 } from "../target/types/anchor_escrow_q2_2026";
import { Commitment, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import NodeWallet from "@anchor-lang/core/dist/cjs/nodewallet";
import { BN } from "bn.js";
import { randomBytes } from "crypto";
import { ASSOCIATED_PROGRAM_ID } from "@anchor-lang/core/dist/cjs/utils/token";
import { expect } from "chai";

const commitment: Commitment = "confirmed";

describe("anchor-escrow-q2-2026", () => {
  const confirmTx = async (signature: string) => {
    const latestBlockhash = await anchor.getProvider().connection.getLatestBlockhash();
    await anchor.getProvider().connection.confirmTransaction(
      {
        signature,
        ...latestBlockhash,
      },
      commitment
    );
  };

  const confirmTxs = async (signatures: string[]) => {
    await Promise.all(signatures.map(confirmTx));
  };

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.anchorEscrowQ22026 as Program<AnchorEscrowQ22026>;
  const connection = provider.connection;
  
  const payer = provider.wallet as NodeWallet;
  const taker = Keypair.generate();

  let mintA: PublicKey;
  let mintB: PublicKey;
  let makerAtaA: PublicKey;
  let makerAtaB: PublicKey;
  let takerAtaA: PublicKey;
  let takerAtaB: PublicKey;
  let vault: PublicKey;
  let seed: BN;
  let escrow: PublicKey;

  const DEPOSIT_AMOUNT = new BN(1_000_000);
  const RECEIVE_AMOUNT = new BN(1_000_000);

  beforeEach(async () => {
    seed = new BN(randomBytes(8));
    escrow = PublicKey.findProgramAddressSync([
      Buffer.from("escrow"), 
      payer.publicKey.toBuffer(), 
      seed.toBuffer("le", 8)
    ], program.programId)[0];
  });

  async function setupMintsAndAccounts() {
    mintA = await createMint(connection, payer.payer, provider.publicKey, provider.publicKey, 6);
    mintB = await createMint(connection, payer.payer, provider.publicKey, provider.publicKey, 6);
    vault = getAssociatedTokenAddressSync(mintA, escrow, true);

    makerAtaA = (await getOrCreateAssociatedTokenAccount(connection, payer.payer, mintA, provider.publicKey)).address;
    makerAtaB = (await getOrCreateAssociatedTokenAccount(connection, payer.payer, mintB, provider.publicKey)).address;
    takerAtaA = (await getOrCreateAssociatedTokenAccount(connection, payer.payer, mintA, taker.publicKey)).address;
    takerAtaB = (await getOrCreateAssociatedTokenAccount(connection, payer.payer, mintB, taker.publicKey)).address;

    await mintTo(connection, payer.payer, mintA, makerAtaA, payer.payer, 1000_000_000);
    await mintTo(connection, payer.payer, mintB, takerAtaB, payer.payer, 1000_000_000);
  }

  async function getTokenBalance(address: PublicKey): Promise<number> {
    const info = await connection.getTokenAccountBalance(address, commitment);
    return parseInt(info.value.amount);
  }

  async function airdropToTaker() {
    const sig = await anchor.getProvider().connection.requestAirdrop(
      taker.publicKey, 
      10 * LAMPORTS_PER_SOL
    );
    await confirmTx(sig);
  }

  describe("Setup", () => {
    it("Request airdrop to taker!", async () => {
      await airdropToTaker();
    });

    it("Mint Tokens to Maker and Taker!", async () => {
      await setupMintsAndAccounts();
      expect(mintA).to.not.be.undefined;
      expect(mintB).to.not.be.undefined;
    });
  });

  describe("Make", () => {
    it("Creates escrow and deposits tokens", async () => {
      const initialMakerBalance = await getTokenBalance(makerAtaA);
      
      const tx = await program.methods.make(
        seed,
        DEPOSIT_AMOUNT,
        RECEIVE_AMOUNT,
      ).accountsStrict({
        maker: payer.publicKey,
        mintA: mintA,
        mintB: mintB,
        makerAtaA: makerAtaA,
        escrow: escrow,
        vault: vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      await confirmTx(tx);

      const vaultBalance = await getTokenBalance(vault);
      const finalMakerBalance = await getTokenBalance(makerAtaA);

      expect(vaultBalance).to.equal(DEPOSIT_AMOUNT.toNumber());
      expect(finalMakerBalance).to.equal(initialMakerBalance - DEPOSIT_AMOUNT.toNumber());
    });

    it("Creates escrow with different seed", async () => {
      const seed2 = new BN(randomBytes(8));
      const escrow2 = PublicKey.findProgramAddressSync([
        Buffer.from("escrow"), 
        payer.publicKey.toBuffer(), 
        seed2.toBuffer("le", 8)
      ], program.programId)[0];
      const vault2 = getAssociatedTokenAddressSync(mintA, escrow2, true);

      const tx = await program.methods.make(
        seed2,
        DEPOSIT_AMOUNT,
        RECEIVE_AMOUNT,
      ).accountsStrict({
        maker: payer.publicKey,
        mintA: mintA,
        mintB: mintB,
        makerAtaA: makerAtaA,
        escrow: escrow2,
        vault: vault2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      await confirmTx(tx);

      const vaultBalance = await getTokenBalance(vault2);
      expect(vaultBalance).to.equal(DEPOSIT_AMOUNT.toNumber());
    });
  });

  describe("Refund", () => {
    it("Refunds tokens to maker and closes vault", async () => {
      const initialMakerBalance = await getTokenBalance(makerAtaA);

      const tx = await program.methods.refund().accountsPartial({
        maker: provider.publicKey,
        mintA: mintA,
        makerAtaA: makerAtaA,
        vault: vault,
        escrow: escrow,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      await confirmTx(tx);

      const finalMakerBalance = await getTokenBalance(makerAtaA);
      expect(finalMakerBalance).to.equal(initialMakerBalance + DEPOSIT_AMOUNT.toNumber());

      const vaultInfo = await connection.getAccountInfo(vault);
      expect(vaultInfo).to.be.null;
    });

    it("Cannot refund after already refunded (vault closed)", async () => {
      try {
        await program.methods.refund().accountsPartial({
          maker: provider.publicKey,
          mintA: mintA,
          makerAtaA: makerAtaA,
          vault: vault,
          escrow: escrow,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        }).rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.message).to.include("0x");
      }
    });
  });

  describe("Take", () => {
    beforeEach(async () => {
      const tx = await program.methods.make(
        seed,
        DEPOSIT_AMOUNT,
        RECEIVE_AMOUNT,
      ).accountsStrict({
        maker: payer.publicKey,
        mintA: mintA,
        mintB: mintB,
        makerAtaA: makerAtaA,
        escrow: escrow,
        vault: vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();
      await confirmTx(tx);
    });

    it("Exchanges tokens correctly", async () => {
      const initialTakerABalance = await getTokenBalance(takerAtaA);
      const initialTakerBBalance = await getTokenBalance(takerAtaB);
      const initialMakerBBalance = await getTokenBalance(makerAtaB);

      const tx = await program.methods.take().accountsPartial({
        taker: taker.publicKey,
        maker: provider.publicKey,
        mintA: mintA,
        mintB: mintB,
        vault: vault,
        makerAtaB: makerAtaB,
        takerAtaA: takerAtaA,
        takerAtaB: takerAtaB,
        escrow: escrow,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).signers([taker]).rpc();

      await confirmTx(tx);

      const finalTakerABalance = await getTokenBalance(takerAtaA);
      const finalMakerBBalance = await getTokenBalance(makerAtaB);

      expect(finalTakerABalance).to.equal(initialTakerABalance + DEPOSIT_AMOUNT.toNumber());
      expect(finalMakerBBalance).to.equal(initialMakerBBalance + RECEIVE_AMOUNT.toNumber());

      const vaultInfo = await connection.getAccountInfo(vault);
      expect(vaultInfo).to.be.null;
    });
  });

  describe("Edge Cases", () => {
    it("Handles zero deposit amount", async () => {
      const seed2 = new BN(randomBytes(8));
      const escrow2 = PublicKey.findProgramAddressSync([
        Buffer.from("escrow"), 
        payer.publicKey.toBuffer(), 
        seed2.toBuffer("le", 8)
      ], program.programId)[0];
      const vault2 = getAssociatedTokenAddressSync(mintA, escrow2, true);

      const tx = await program.methods.make(
        seed2,
        new BN(0),
        new BN(1),
      ).accountsStrict({
        maker: payer.publicKey,
        mintA: mintA,
        mintB: mintB,
        makerAtaA: makerAtaA,
        escrow: escrow2,
        vault: vault2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      await confirmTx(tx);

      const vaultBalance = await getTokenBalance(vault2);
      expect(vaultBalance).to.equal(0);
    });

    it("Handles large deposit amount", async () => {
      const seed2 = new BN(randomBytes(8));
      const escrow2 = PublicKey.findProgramAddressSync([
        Buffer.from("escrow"), 
        payer.publicKey.toBuffer(), 
        seed2.toBuffer("le", 8)
      ], program.programId)[0];
      const vault2 = getAssociatedTokenAddressSync(mintA, escrow2, true);

      const largeDeposit = new BN(999_999_000);

      const tx = await program.methods.make(
        seed2,
        largeDeposit,
        new BN(1),
      ).accountsStrict({
        maker: payer.publicKey,
        mintA: mintA,
        mintB: mintB,
        makerAtaA: makerAtaA,
        escrow: escrow2,
        vault: vault2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      await confirmTx(tx);

      const vaultBalance = await getTokenBalance(vault2);
      expect(vaultBalance).to.equal(parseInt(largeDeposit.toString()));
    });

    it("Creates escrow with matching mints (same token)", async () => {
      const seed2 = new BN(randomBytes(8));
      const escrow2 = PublicKey.findProgramAddressSync([
        Buffer.from("escrow"), 
        payer.publicKey.toBuffer(), 
        seed2.toBuffer("le", 8)
      ], program.programId)[0];
      const vault2 = getAssociatedTokenAddressSync(mintA, escrow2, true);

      const tx = await program.methods.make(
        seed2,
        new BN(100),
        new BN(200),
      ).accountsStrict({
        maker: payer.publicKey,
        mintA: mintA,
        mintB: mintA,
        makerAtaA: makerAtaA,
        escrow: escrow2,
        vault: vault2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      await confirmTx(tx);

      const vaultBalance = await getTokenBalance(vault2);
      expect(vaultBalance).to.equal(100);
    });
  });

  describe("Error Cases", () => {
    it("Fails when taker has insufficient tokens for receive amount", async () => {
      const takerWithNoTokens = Keypair.generate();
      await airdropToTaker();

      const takerOnlyAtaA = (await getOrCreateAssociatedTokenAccount(
        connection, 
        payer.payer, 
        mintA, 
        takerWithNoTokens.publicKey
      )).address;

      const seed2 = new BN(randomBytes(8));
      const escrow2 = PublicKey.findProgramAddressSync([
        Buffer.from("escrow"), 
        provider.publicKey.toBuffer(), 
        seed2.toBuffer("le", 8)
      ], program.programId)[0];
      const vault2 = getAssociatedTokenAddressSync(mintA, escrow2, true);

      await program.methods.make(
        seed2,
        new BN(100),
        new BN(500),
      ).accountsStrict({
        maker: provider.publicKey,
        mintA: mintA,
        mintB: mintB,
        makerAtaA: makerAtaA,
        escrow: escrow2,
        vault: vault2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      try {
        await program.methods.take().accountsPartial({
          taker: takerWithNoTokens.publicKey,
          maker: provider.publicKey,
          mintA: mintA,
          mintB: mintB,
          vault: vault2,
          makerAtaB: makerAtaB,
          takerAtaA: takerOnlyAtaA,
          takerAtaB: takerAtaB,
          escrow: escrow2,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        }).signers([takerWithNoTokens]).rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.message).to.include("0x");
      }
    });

    it("Fails when wrong taker tries to take", async () => {
      const wrongTaker = Keypair.generate();
      await airdropToTaker();

      try {
        await program.methods.take().accountsPartial({
          taker: wrongTaker.publicKey,
          maker: provider.publicKey,
          mintA: mintA,
          mintB: mintB,
          vault: vault,
          makerAtaB: makerAtaB,
          takerAtaA: takerAtaA,
          takerAtaB: takerAtaB,
          escrow: escrow,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        }).signers([wrongTaker]).rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.message).to.include("0x");
      }
    });

    it("Fails when maker tries to take instead of taker", async () => {
      const makerWithTokens = Keypair.generate();
      await airdropToTaker();

      const makerAta = (await getOrCreateAssociatedTokenAccount(
        connection, 
        payer.payer, 
        mintA, 
        makerWithTokens.publicKey
      )).address;

      await mintTo(connection, payer.payer, mintA, makerAta, payer.payer, 1000_000_000);

      const seed2 = new BN(randomBytes(8));
      const escrow2 = PublicKey.findProgramAddressSync([
        Buffer.from("escrow"), 
        provider.publicKey.toBuffer(), 
        seed2.toBuffer("le", 8)
      ], program.programId)[0];
      const vault2 = getAssociatedTokenAddressSync(mintA, escrow2, true);

      await program.methods.make(
        seed2,
        new BN(100),
        new BN(100),
      ).accountsStrict({
        maker: provider.publicKey,
        mintA: mintA,
        mintB: mintB,
        makerAtaA: makerAtaA,
        escrow: escrow2,
        vault: vault2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      try {
        await program.methods.take().accountsPartial({
          taker: provider.publicKey,
          maker: provider.publicKey,
          mintA: mintA,
          mintB: mintB,
          vault: vault2,
          makerAtaB: makerAtaB,
          takerAtaA: takerAtaA,
          takerAtaB: takerAtaB,
          escrow: escrow2,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        }).rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.message).to.include("0x");
      }
    });

    it("Fails with mismatched mint in take", async () => {
      const wrongMint = await createMint(connection, payer.payer, provider.publicKey, provider.publicKey, 6);

      try {
        await program.methods.take().accountsPartial({
          taker: taker.publicKey,
          maker: provider.publicKey,
          mintA: wrongMint,
          mintB: mintB,
          vault: vault,
          makerAtaB: makerAtaB,
          takerAtaA: takerAtaA,
          takerAtaB: takerAtaB,
          escrow: escrow,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        }).signers([taker]).rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.message).to.include("0x");
      }
    });
  });

  describe("State Integrity", () => {
    it("Escrow account contains correct data after make", async () => {
      const accountData = await program.account.escrow.fetch(escrow);
      
      expect(accountData.seed.toString()).to.equal(seed.toString());
      expect(accountData.maker.toString()).to.equal(payer.publicKey.toString());
      expect(accountData.mintA.toString()).to.equal(mintA.toString());
      expect(accountData.mintB.toString()).to.equal(mintB.toString());
      expect(accountData.receive.toString()).to.equal(RECEIVE_AMOUNT.toString());
      expect(accountData.bump).to.be.greaterThan(0);
    });

    it("Multiple escrows can coexist with different seeds", async () => {
      const seed1 = new BN(1);
      const seed2 = new BN(2);
      const seed3 = new BN(3);

      const escrow1 = PublicKey.findProgramAddressSync([
        Buffer.from("escrow"), 
        payer.publicKey.toBuffer(), 
        seed1.toBuffer("le", 8)
      ], program.programId)[0];
      const escrow2 = PublicKey.findProgramAddressSync([
        Buffer.from("escrow"), 
        payer.publicKey.toBuffer(), 
        seed2.toBuffer("le", 8)
      ], program.programId)[0];
      const escrow3 = PublicKey.findProgramAddressSync([
        Buffer.from("escrow"), 
        payer.publicKey.toBuffer(), 
        seed3.toBuffer("le", 8)
      ], program.programId)[0];

      const vault1 = getAssociatedTokenAddressSync(mintA, escrow1, true);
      const vault2 = getAssociatedTokenAddressSync(mintA, escrow2, true);
      const vault3 = getAssociatedTokenAddressSync(mintA, escrow3, true);

      await program.methods.make(seed1, new BN(100), new BN(100)).accountsStrict({
        maker: payer.publicKey,
        mintA: mintA,
        mintB: mintB,
        makerAtaA: makerAtaA,
        escrow: escrow1,
        vault: vault1,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      await program.methods.make(seed2, new BN(200), new BN(200)).accountsStrict({
        maker: payer.publicKey,
        mintA: mintA,
        mintB: mintB,
        makerAtaA: makerAtaA,
        escrow: escrow2,
        vault: vault2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      await program.methods.make(seed3, new BN(300), new BN(300)).accountsStrict({
        maker: payer.publicKey,
       mintA: mintA,
        mintB: mintB,
        makerAtaA: makerAtaA,
        escrow: escrow3,
        vault: vault3,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      const vaultBal1 = await getTokenBalance(vault1);
      const vaultBal2 = await getTokenBalance(vault2);
      const vaultBal3 = await getTokenBalance(vault3);

      expect(vaultBal1).to.equal(100);
      expect(vaultBal2).to.equal(200);
      expect(vaultBal3).to.equal(300);
    });
  });

  describe("Full Flow", () => {
    it("Complete make -> take flow", async () => {
      const seed2 = new BN(randomBytes(8));
      const escrow2 = PublicKey.findProgramAddressSync([
        Buffer.from("escrow"), 
        payer.publicKey.toBuffer(), 
        seed2.toBuffer("le", 8)
      ], program.programId)[0];
      const vault2 = getAssociatedTokenAddressSync(mintA, escrow2, true);

      const initTakerBBal = await getTokenBalance(takerAtaB);
      const initTakerABal = await getTokenBalance(takerAtaA);
      const initMakerBBal = await getTokenBalance(makerAtaB);

      await program.methods.make(seed2, DEPOSIT_AMOUNT, RECEIVE_AMOUNT).accountsStrict({
        maker: payer.publicKey,
        mintA: mintA,
        mintB: mintB,
        makerAtaA: makerAtaA,
        escrow: escrow2,
        vault: vault2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      await program.methods.take().accountsPartial({
        taker: taker.publicKey,
        maker: provider.publicKey,
        mintA: mintA,
        mintB: mintB,
        vault: vault2,
        makerAtaB: makerAtaB,
        takerAtaA: takerAtaA,
        takerAtaB: takerAtaB,
        escrow: escrow2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).signers([taker]).rpc();

      const finalTakerABal = await getTokenBalance(takerAtaA);
      const finalMakerBBal = await getTokenBalance(makerAtaB);

      expect(finalTakerABal).to.equal(initTakerABal + DEPOSIT_AMOUNT.toNumber());
      expect(finalMakerBBal).to.equal(initMakerBBal + RECEIVE_AMOUNT.toNumber());
    });

    it("Complete make -> refund flow", async () => {
      const seed3 = new BN(randomBytes(8));
      const escrow3 = PublicKey.findProgramAddressSync([
        Buffer.from("escrow"), 
        payer.publicKey.toBuffer(), 
        seed3.toBuffer("le", 8)
      ], program.programId)[0];
      const vault3 = getAssociatedTokenAddressSync(mintA, escrow3, true);

      const initMakerABal = await getTokenBalance(makerAtaA);

      await program.methods.make(seed3, DEPOSIT_AMOUNT, RECEIVE_AMOUNT).accountsStrict({
        maker: payer.publicKey,
        mintA: mintA,
        mintB: mintB,
        makerAtaA: makerAtaA,
        escrow: escrow3,
        vault: vault3,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      await program.methods.refund().accountsPartial({
        maker: provider.publicKey,
        mintA: mintA,
        makerAtaA: makerAtaA,
        vault: vault3,
        escrow: escrow3,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      const finalMakerABal = await getTokenBalance(makerAtaA);
      expect(finalMakerABal).to.equal(initMakerABal);
    });
  });
});