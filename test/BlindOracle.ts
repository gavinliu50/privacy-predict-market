import { BlindOracle, BlindOracle__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  charlie: HardhatEthersSigner;
};

describe("BlindOracle - Privacy-Preserving Prediction Market", function () {
  let signers: Signers;
  let blindOracleContract: BlindOracle;
  let contractAddress: string;

  const EVENT_DESCRIPTION = "Will Bitcoin reach $100,000 by end of 2025?";
  const COMMITMENT_DURATION = 3600; // 1 hour
  const EVENT_DURATION = 86400 * 30; // 30 days

  async function deployFixture() {
    const factory = (await ethers.getContractFactory("BlindOracle")) as BlindOracle__factory;
    const contract = (await factory.deploy(
      0, // MarketType.Event
      EVENT_DESCRIPTION,
      COMMITMENT_DURATION,
      EVENT_DURATION,
      ethers.ZeroAddress, // No oracle for event market
      0, // No asset
      0  // No target price
    )) as BlindOracle;
    const address = await contract.getAddress();

    return { contract, address };
  }

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = {
      deployer: ethSigners[0],
      alice: ethSigners[1],
      bob: ethSigners[2],
      charlie: ethSigners[3],
    };
  });

  beforeEach(async () => {
    ({ contract: blindOracleContract, address: contractAddress } = await deployFixture());
  });

  describe("Deployment", function () {
    it("should deploy successfully", async function () {
      console.log(`BlindOracle deployed at: ${contractAddress}`);
      expect(ethers.isAddress(contractAddress)).to.eq(true);
    });

    it("should initialize with correct parameters", async function () {
      const eventDesc = await blindOracleContract.eventDescription();
      const owner = await blindOracleContract.owner();
      const phase = await blindOracleContract.currentPhase();

      expect(eventDesc).to.eq(EVENT_DESCRIPTION);
      expect(owner).to.eq(signers.deployer.address);
      expect(phase).to.eq(0); // Phase.BlindCommitment
    });
  });

  describe("Phase 1: Blind Commitment", function () {
    it("should allow Alice to commit a YES prediction", async function () {
      const betAmount = ethers.parseEther("1.0");
      const prediction = 1; // YES

      // Create encrypted inputs
      const encryptedInput = await fhevm
        .createEncryptedInput(contractAddress, signers.alice.address)
        .add8(prediction)
        .add64(Number(betAmount))
        .encrypt();

      // Commit prediction
      const tx = await blindOracleContract
        .connect(signers.alice)
        .commitPrediction(
          encryptedInput.handles[0],
          encryptedInput.handles[1],
          encryptedInput.inputProof,
          encryptedInput.inputProof,
          { value: betAmount }
        );

      await tx.wait();

      // Verify commitment
      const hasCommitted = await blindOracleContract.hasUserCommitted(signers.alice.address);
      expect(hasCommitted).to.eq(true);

      const participantCount = await blindOracleContract.getParticipantCount();
      expect(participantCount).to.eq(1);
    });

    it("should allow Bob to commit a NO prediction", async function () {
      const betAmount = ethers.parseEther("2.0");
      const prediction = 0; // NO

      // Create encrypted inputs
      const encryptedInput = await fhevm
        .createEncryptedInput(contractAddress, signers.bob.address)
        .add8(prediction)
        .add64(Number(betAmount))
        .encrypt();

      // Commit prediction
      const tx = await blindOracleContract
        .connect(signers.bob)
        .commitPrediction(
          encryptedInput.handles[0],
          encryptedInput.handles[1],
          encryptedInput.inputProof,
          encryptedInput.inputProof,
          { value: betAmount }
        );

      await tx.wait();

      // Verify commitment
      const hasCommitted = await blindOracleContract.hasUserCommitted(signers.bob.address);
      expect(hasCommitted).to.eq(true);
    });

    it("should allow multiple users to commit", async function () {
      // Alice commits YES with 1 ETH
      const aliceBet = ethers.parseEther("1.0");
      const aliceInput = await fhevm
        .createEncryptedInput(contractAddress, signers.alice.address)
        .add8(1)
        .add64(Number(aliceBet))
        .encrypt();

      await blindOracleContract
        .connect(signers.alice)
        .commitPrediction(
          aliceInput.handles[0],
          aliceInput.handles[1],
          aliceInput.inputProof,
          aliceInput.inputProof,
          { value: aliceBet }
        );

      // Bob commits NO with 2 ETH
      const bobBet = ethers.parseEther("2.0");
      const bobInput = await fhevm
        .createEncryptedInput(contractAddress, signers.bob.address)
        .add8(0)
        .add64(Number(bobBet))
        .encrypt();

      await blindOracleContract
        .connect(signers.bob)
        .commitPrediction(
          bobInput.handles[0],
          bobInput.handles[1],
          bobInput.inputProof,
          bobInput.inputProof,
          { value: bobBet }
        );

      // Charlie commits YES with 1.5 ETH
      const charlieBet = ethers.parseEther("1.5");
      const charlieInput = await fhevm
        .createEncryptedInput(contractAddress, signers.charlie.address)
        .add8(1)
        .add64(Number(charlieBet))
        .encrypt();

      await blindOracleContract
        .connect(signers.charlie)
        .commitPrediction(
          charlieInput.handles[0],
          charlieInput.handles[1],
          charlieInput.inputProof,
          charlieInput.inputProof,
          { value: charlieBet }
        );

      // Verify all commitments
      const participantCount = await blindOracleContract.getParticipantCount();
      expect(participantCount).to.eq(3);

      const balance = await blindOracleContract.getBalance();
      expect(balance).to.eq(ethers.parseEther("4.5"));
    });

    it("should prevent double commitment", async function () {
      const betAmount = ethers.parseEther("1.0");
      const encryptedInput = await fhevm
        .createEncryptedInput(contractAddress, signers.alice.address)
        .add8(1)
        .add64(Number(betAmount))
        .encrypt();

      // First commitment
      await blindOracleContract
        .connect(signers.alice)
        .commitPrediction(
          encryptedInput.handles[0],
          encryptedInput.handles[1],
          encryptedInput.inputProof,
          encryptedInput.inputProof,
          { value: betAmount }
        );

      // Second commitment should fail
      await expect(
        blindOracleContract
          .connect(signers.alice)
          .commitPrediction(
            encryptedInput.handles[0],
            encryptedInput.handles[1],
            encryptedInput.inputProof,
            encryptedInput.inputProof,
            { value: betAmount }
          )
      ).to.be.revertedWith("Already committed");
    });

    it("should prevent commitment without ETH", async function () {
      const encryptedInput = await fhevm
        .createEncryptedInput(contractAddress, signers.alice.address)
        .add8(1)
        .add64(Number(ethers.parseEther("1.0")))
        .encrypt();

      await expect(
        blindOracleContract
          .connect(signers.alice)
          .commitPrediction(
            encryptedInput.handles[0],
            encryptedInput.handles[1],
            encryptedInput.inputProof,
            encryptedInput.inputProof,
            { value: 0 }
          )
      ).to.be.revertedWith("Must send ETH with commitment");
    });

    it("should allow users to retrieve their encrypted commitment", async function () {
      const betAmount = ethers.parseEther("1.0");
      const prediction = 1;

      const encryptedInput = await fhevm
        .createEncryptedInput(contractAddress, signers.alice.address)
        .add8(prediction)
        .add64(Number(betAmount))
        .encrypt();

      await blindOracleContract
        .connect(signers.alice)
        .commitPrediction(
          encryptedInput.handles[0],
          encryptedInput.handles[1],
          encryptedInput.inputProof,
          encryptedInput.inputProof,
          { value: betAmount }
        );

      // Get encrypted commitment
      const commitment = await blindOracleContract.connect(signers.alice).getMyCommitment();

      // Decrypt and verify
      const decryptedPrediction = await fhevm.userDecryptEuint(
        FhevmType.euint8,
        commitment.prediction,
        contractAddress,
        signers.alice
      );

      const decryptedAmount = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        commitment.amount,
        contractAddress,
        signers.alice
      );

      expect(decryptedPrediction).to.eq(prediction);
      expect(decryptedAmount).to.eq(betAmount);
    });
  });

  describe("Phase 2: Price Discovery", function () {
    beforeEach(async function () {
      // Setup: Have 3 users commit predictions
      // Alice: YES, 1 ETH
      const aliceBet = ethers.parseEther("1.0");
      const aliceInput = await fhevm
        .createEncryptedInput(contractAddress, signers.alice.address)
        .add8(1)
        .add64(Number(aliceBet))
        .encrypt();

      await blindOracleContract
        .connect(signers.alice)
        .commitPrediction(
          aliceInput.handles[0],
          aliceInput.handles[1],
          aliceInput.inputProof,
          aliceInput.inputProof,
          { value: aliceBet }
        );

      // Bob: NO, 2 ETH
      const bobBet = ethers.parseEther("2.0");
      const bobInput = await fhevm
        .createEncryptedInput(contractAddress, signers.bob.address)
        .add8(0)
        .add64(Number(bobBet))
        .encrypt();

      await blindOracleContract
        .connect(signers.bob)
        .commitPrediction(
          bobInput.handles[0],
          bobInput.handles[1],
          bobInput.inputProof,
          bobInput.inputProof,
          { value: bobBet }
        );

      // Charlie: YES, 1.5 ETH
      const charlieBet = ethers.parseEther("1.5");
      const charlieInput = await fhevm
        .createEncryptedInput(contractAddress, signers.charlie.address)
        .add8(1)
        .add64(Number(charlieBet))
        .encrypt();

      await blindOracleContract
        .connect(signers.charlie)
        .commitPrediction(
          charlieInput.handles[0],
          charlieInput.handles[1],
          charlieInput.inputProof,
          charlieInput.inputProof,
          { value: charlieBet }
        );

      // Fast forward time past commitment deadline
      await ethers.provider.send("evm_increaseTime", [COMMITMENT_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);
    });

    it("should aggregate encrypted bets", async function () {
      const tx = await blindOracleContract.connect(signers.deployer).aggregateBets();
      await tx.wait();

      const isAggregated = await blindOracleContract.isAggregated();
      expect(isAggregated).to.eq(true);

      const phase = await blindOracleContract.currentPhase();
      expect(phase).to.eq(1); // Phase.Aggregating
    });

    it("should allow anyone to aggregate after deadline", async function () {
      // After removing onlyOwner modifier, anyone can aggregate
      const tx = await blindOracleContract.connect(signers.alice).aggregateBets();
      await tx.wait();

      const isAggregated = await blindOracleContract.isAggregated();
      expect(isAggregated).to.eq(true);
    });

    it("should request decryption after aggregation", async function () {
      // First aggregate
      await blindOracleContract.connect(signers.deployer).aggregateBets();

      // Then request decryption
      const tx = await blindOracleContract.connect(signers.deployer).requestAggregateDecryption();
      const receipt = await tx.wait();

      const phase = await blindOracleContract.currentPhase();
      expect(phase).to.eq(2); // Phase.AwaitingDecryption
    });
  });

  describe("Phase 3: Settlement (Note: Full settlement requires Gateway callback)", function () {
    it("should check market is not settled initially", async function () {
      const isSettled = await blindOracleContract.isSettled();
      expect(isSettled).to.eq(false);
    });

    it("should check settlement proposal status", async function () {
      const isSettlementProposed = await blindOracleContract.isSettlementProposed();
      expect(isSettlementProposed).to.eq(false);
    });

    it("should have zero owner stake initially", async function () {
      const ownerStake = await blindOracleContract.ownerStake();
      expect(ownerStake).to.eq(0);
    });
  });

  describe("View Functions", function () {
    it("should return correct market info", async function () {
      const marketInfo = await blindOracleContract.getMarketInfo();

      expect(marketInfo.phase).to.eq(0); // BlindCommitment
      expect(marketInfo._isSettled).to.eq(false);
    });

    it("should return participant count", async function () {
      const count = await blindOracleContract.getParticipantCount();
      expect(count).to.eq(0);
    });

    it("should return contract balance", async function () {
      const balance = await blindOracleContract.getBalance();
      expect(balance).to.eq(0);
    });

    it("should return user commitment", async function () {
      const betAmount = ethers.parseEther("1.0");
      const prediction = 1;

      const encryptedInput = await fhevm
        .createEncryptedInput(contractAddress, signers.alice.address)
        .add8(prediction)
        .add64(Number(betAmount))
        .encrypt();

      await blindOracleContract
        .connect(signers.alice)
        .commitPrediction(
          encryptedInput.handles[0],
          encryptedInput.handles[1],
          encryptedInput.inputProof,
          encryptedInput.inputProof,
          { value: betAmount }
        );

      const commitment = await blindOracleContract.getUserCommitment(signers.alice.address);
      expect(commitment.hasCommitted).to.eq(true);
    });
  });
});
