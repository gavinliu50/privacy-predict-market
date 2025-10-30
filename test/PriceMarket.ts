import { BlindOracle, BlindOracle__factory, ChainlinkPriceOracle, ChainlinkPriceOracle__factory, MockChainlinkAggregator, MockChainlinkAggregator__factory } from "../types";
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

describe("Price Market with Chainlink Oracle", function () {
  let signers: Signers;
  let priceOracleContract: ChainlinkPriceOracle;
  let priceMarketContract: BlindOracle;
  let mockEthFeed: MockChainlinkAggregator;
  let mockBtcFeed: MockChainlinkAggregator;
  let oracleAddress: string;
  let marketAddress: string;

  const COMMITMENT_DURATION = 3600; // 1 hour
  const EVENT_DURATION = 7200; // 2 hours
  const TARGET_PRICE = 5000_00000000n; // $5,000 (scaled by 1e8)
  const INITIAL_ETH_PRICE = 3500_00000000n; // $3,500
  const INITIAL_BTC_PRICE = 95000_00000000n; // $95,000

  async function deployFixture() {
    // Deploy Mock Chainlink Aggregators
    const mockAggregatorFactory = (await ethers.getContractFactory("MockChainlinkAggregator")) as MockChainlinkAggregator__factory;

    const ethFeed = (await mockAggregatorFactory.deploy(
      INITIAL_ETH_PRICE,
      8 // decimals
    )) as MockChainlinkAggregator;

    const btcFeed = (await mockAggregatorFactory.deploy(
      INITIAL_BTC_PRICE,
      8 // decimals
    )) as MockChainlinkAggregator;

    const ethFeedAddr = await ethFeed.getAddress();
    const btcFeedAddr = await btcFeed.getAddress();

    // Deploy ChainlinkPriceOracle with mock feeds
    const oracleFactory = (await ethers.getContractFactory("ChainlinkPriceOracle")) as ChainlinkPriceOracle__factory;
    const oracle = (await oracleFactory.deploy(
      ethFeedAddr,
      btcFeedAddr,
      ethers.ZeroAddress // SOL not available
    )) as ChainlinkPriceOracle;
    const oracleAddr = await oracle.getAddress();

    // Deploy BlindOracle as Price Market
    const marketFactory = (await ethers.getContractFactory("BlindOracle")) as BlindOracle__factory;
    const market = (await marketFactory.deploy(
      1, // MarketType.Price
      "Will ETH price be above $5,000?",
      COMMITMENT_DURATION,
      EVENT_DURATION,
      oracleAddr,
      0, // Asset.ETH
      TARGET_PRICE
    )) as BlindOracle;
    const marketAddr = await market.getAddress();

    return { oracle, oracleAddr, market, marketAddr, ethFeed, btcFeed };
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
    ({ oracle: priceOracleContract, oracleAddr: oracleAddress, market: priceMarketContract, marketAddr: marketAddress, ethFeed: mockEthFeed, btcFeed: mockBtcFeed } = await deployFixture());
  });

  describe("Deployment", function () {
    it("should deploy price oracle successfully", async function () {
      expect(ethers.isAddress(oracleAddress)).to.eq(true);
    });

    it("should deploy price market successfully", async function () {
      expect(ethers.isAddress(marketAddress)).to.eq(true);
    });

    it("should initialize with correct market type", async function () {
      const marketType = await priceMarketContract.marketType();
      expect(marketType).to.eq(1); // MarketType.Price
    });

    it("should initialize with correct target price", async function () {
      const targetPrice = await priceMarketContract.targetPrice();
      expect(targetPrice).to.eq(TARGET_PRICE);
    });

    it("should initialize with correct oracle address", async function () {
      const oracle = await priceMarketContract.priceOracle();
      expect(oracle).to.eq(oracleAddress);
    });
  });

  describe("Chainlink Oracle Integration", function () {
    it("should fetch ETH price from Chainlink", async function () {
      const [price, timestamp] = await priceOracleContract.getPrice(0); // Asset.ETH
      
      expect(price).to.be.greaterThan(0);
      expect(timestamp).to.be.greaterThan(0);
    });

    it("should fetch BTC price from Chainlink", async function () {
      const [price, timestamp] = await priceOracleContract.getPrice(1); // Asset.BTC
      
      expect(price).to.be.greaterThan(0);
      expect(timestamp).to.be.greaterThan(0);
    });

    it("should validate price freshness", async function () {
      const [price, timestamp] = await priceOracleContract.getPrice(0);
      const currentTime = Math.floor(Date.now() / 1000);
      const maxAge = 24 * 3600; // 24 hours
      
      expect(currentTime - Number(timestamp)).to.be.lessThan(maxAge);
    });
  });

  describe("Price Market Settlement (Note: Full settlement requires Gateway callback)", function () {
    it("should prevent settlement before event deadline", async function () {
      await expect(
        priceMarketContract.settlePriceMarket()
      ).to.be.revertedWith("Event not ended yet");
    });

    it("should prevent settlement without aggregation", async function () {
      // Deploy a new market without aggregation
      const newMarket = await (await ethers.getContractFactory("BlindOracle")).deploy(
        1, // MarketType.Price
        "Test market",
        COMMITMENT_DURATION,
        EVENT_DURATION,
        oracleAddress,
        0,
        TARGET_PRICE
      ) as BlindOracle;

      // Fast forward past event deadline
      await ethers.provider.send("evm_increaseTime", [EVENT_DURATION + COMMITMENT_DURATION + 2]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        newMarket.settlePriceMarket()
      ).to.be.revertedWith("Must complete aggregation and decryption first");
    });

    it("should check market is not settled initially", async function () {
      const isSettled = await priceMarketContract.isSettled();
      expect(isSettled).to.eq(false);
    });
  });

  describe("Price Market vs Event Market", function () {
    it("should prevent owner from participating in event markets", async function () {
      // Deploy an event market
      const eventMarket = await (await ethers.getContractFactory("BlindOracle")).deploy(
        0, // MarketType.Event
        "Test event market",
        COMMITMENT_DURATION,
        EVENT_DURATION,
        ethers.ZeroAddress,
        0,
        0
      ) as BlindOracle;

      const betAmount = ethers.parseEther("1.0");
      const encryptedInput = await fhevm
        .createEncryptedInput(await eventMarket.getAddress(), signers.deployer.address)
        .add8(1)
        .add64(Number(betAmount))
        .encrypt();

      // Owner tries to participate
      await expect(
        eventMarket
          .connect(signers.deployer)
          .commitPrediction(
            encryptedInput.handles[0],
            encryptedInput.handles[1],
            encryptedInput.inputProof,
            encryptedInput.inputProof,
            { value: betAmount }
          )
      ).to.be.revertedWith("Owner cannot participate in event markets");
    });

    it("should allow owner to participate in price markets", async function () {
      const betAmount = ethers.parseEther("1.0");
      const encryptedInput = await fhevm
        .createEncryptedInput(marketAddress, signers.deployer.address)
        .add8(1)
        .add64(Number(betAmount))
        .encrypt();

      // Owner participates in price market (should succeed)
      const tx = await priceMarketContract
        .connect(signers.deployer)
        .commitPrediction(
          encryptedInput.handles[0],
          encryptedInput.handles[1],
          encryptedInput.inputProof,
          encryptedInput.inputProof,
          { value: betAmount }
        );

      await tx.wait();

      const hasCommitted = await priceMarketContract.hasUserCommitted(signers.deployer.address);
      expect(hasCommitted).to.eq(true);
    });
  });
});

