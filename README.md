# The Blind Oracle 🔮

> **Privacy-Preserving Prediction Market** powered by **Fully Homomorphic Encryption**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-^0.8.24-blue)](https://soliditylang.org/)
[![Zama fhEVM](https://img.shields.io/badge/Zama-fhEVM-purple)](https://docs.zama.ai/fhevm)
[![Deployed](https://img.shields.io/badge/Deployed-Sepolia-green)](https://sepolia.etherscan.io/)

---

## � What Makes This Different?

**The Blind Oracle** is a next-generation prediction market that uses **Fully Homomorphic Encryption (FHE)** to solve critical problems plaguing traditional prediction markets:

### Problems with Traditional Prediction Markets

| Problem | Impact | How We Solve It |
|---------|--------|-----------------|
| **Front-Running** | MEV bots extract value by front-running large orders | ✅ All predictions encrypted until commitment phase ends |
| **Information Asymmetry** | Whales' positions are visible, influencing smaller traders | ✅ No one can see market sentiment during commitment |
| **Herd Behavior** | Late participants blindly follow early trends instead of independent analysis | ✅ Fair price discovery only after blind commitment |
| **Price Manipulation** | Early large bets can manipulate market prices | ✅ Initial prices determined by encrypted aggregation |

### � The Power of Fully Homomorphic Encryption

Unlike traditional privacy solutions (mixers, zero-knowledge proofs), **FHE allows computation on encrypted data**:

```solidity
// Aggregate encrypted bets WITHOUT decryption
encryptedTotalYes = FHE.add(encryptedTotalYes, yesContribution);

// Multiply encrypted values homomorphically
euint64 yesContribution = FHE.mul(amount, isYes64);

// Decrypt only when needed via secure Gateway
uint256 requestId = FHE.requestDecryption(cts, callback);
```

**Key Benefits**:
- 🔒 **On-Chain Privacy**: All privacy guarantees enforced by smart contracts
- 🔐 **Encrypted Computation**: Calculate totals without revealing individual bets
- 🔓 **Selective Decryption**: Users can decrypt their own data anytime
- ⚡ **No Trusted Setup**: Unlike zk-SNARKs, FHE requires no trusted setup

---

## 🚀 Quick Start

### Live Deployment (Sepolia Testnet)

- **ChainlinkPriceOracle**: [`0xa4354930CecCCCE2CbE122Fb5ABb156014E83FD9`](https://sepolia.etherscan.io/address/0xa4354930CecCCCE2CbE122Fb5ABb156014E83FD9)
- **MarketFactory**: [`0xb8b3a26AD1a1213Cf8c0509442E7B0C766Bd1ebB`](https://sepolia.etherscan.io/address/0xb8b3a26AD1a1213Cf8c0509442E7B0C766Bd1ebB)
- **Frontend**: React + TypeScript + RainbowKit + Zama SDK

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    The Blind Oracle                         │
├─────────────────────────────────────────────────────────────┤
│  Phase 1: Blind Commitment (FHE Encrypted Predictions)     │
│  ├─ Users submit euint8 (YES/NO) + euint64 (amount)        │
│  └─ No one can see others' predictions                     │
├─────────────────────────────────────────────────────────────┤
│  Phase 2: Price Discovery (Homomorphic Aggregation)        │
│  ├─ Aggregate encrypted bets using FHE.add/mul             │
│  └─ Request async decryption via Zama Gateway              │
├─────────────────────────────────────────────────────────────┤
│  Phase 3: Settlement                                        │
│  ├─ Event Markets: Manual settlement with challenge period │
│  └─ Price Markets: Automatic settlement via Chainlink      │
├─────────────────────────────────────────────────────────────┤
│  Phase 4: Claim Rewards (FHE Decryption)                   │
│  ├─ Winners decrypt their predictions via EIP-712 signature│
│  └─ Claim proportional share of the pool                   │
└─────────────────────────────────────────────────────────────┘
```

## 🛠️ Technical Stack

### Smart Contracts (Solidity ^0.8.24)

| Contract | Lines | Purpose |
|----------|-------|---------|
| **BlindOracle.sol** | 622 | Core prediction market with FHE encryption |
| **ChainlinkPriceOracle.sol** | 195 | Decentralized price feeds integration |
| **MarketFactory.sol** | 220 | Factory for creating multiple markets |

**FHE Types Used**:
- `euint8`: Encrypted predictions (0 = NO, 1 = YES)
- `euint64`: Encrypted bet amounts (in wei)

### Frontend (React + TypeScript)

- **React 18** with hooks (useState, useEffect, useCallback)
- **Wagmi v2** + **Viem** for Web3 interactions
- **RainbowKit** for wallet connection UX
- **Zama Relayer SDK** for client-side FHE decryption
- **Tailwind CSS** for responsive design

### Integrations

- ✅ **Zama fhEVM**: Fully Homomorphic Encryption
- ✅ **Chainlink Price Feeds**: Decentralized oracles
- ✅ **EIP-712**: Typed signature for FHE decryption

---

## 📦 Installation & Testing

### Prerequisites

- Node.js >= 20
- npm or yarn

### Install Dependencies

```bash
cd privacy-predict-market
npm install
```

### Compile Contracts

```bash
npm run compile
```

### Run Tests

```bash
npm test
```

**Test Coverage** (23 tests):
```
✅ BlindOracle - Privacy-Preserving Prediction Market
  ✔ Deployment (2 tests)
  ✔ Phase 1: Blind Commitment (6 tests)
  ✔ Phase 2: Price Discovery (3 tests)
  ✔ Phase 3: Settlement and Claim Rewards (9 tests)
  ✔ View Functions (4 tests)

✅ Price Market with Chainlink Oracle
  ✔ Deployment (5 tests)
  ✔ Chainlink Oracle Integration (3 tests)
  ✔ Price Market Settlement (6 tests)
  ✔ Price Market vs Event Market (2 tests)
```

### Deploy to Sepolia

```bash
# Configure environment
cp .env.example .env
# Edit .env with your private key

# Deploy
npx hardhat run scripts/deploy-with-chainlink.ts --network sepolia
```

## 🎮 How It Works

### 1️⃣ Create a Market

```typescript
// Event Market: Manual settlement (e.g., "Will Bitcoin reach $120k?")
await factory.createMarket(
  0, // MarketType.Event
  "Will Bitcoin reach $120,000 by end of 2025?",
  3600, // 1 hour commitment period
  86400 * 30, // 30 days until event
  ethers.ZeroAddress, // No oracle
  0, 0 // No asset/price
);

// Price Market: Automatic settlement via Chainlink
await factory.createMarket(
  1, // MarketType.Price
  "Will ETH be above $5,000 on Dec 31?",
  3600, // 1 hour commitment
  86400 * 7, // 7 days until event
  oracleAddress, // Chainlink oracle
  0, // Asset.ETH
  5000_00000000 // $5,000 target
);
```

### 2️⃣ Submit Encrypted Prediction (FHE)

```typescript
// Create encrypted input using Zama SDK
const encryptedInput = await fhevm
  .createEncryptedInput(marketAddress, userAddress)
  .add8(1)  // 1 = YES, 0 = NO (encrypted!)
  .add64(ethers.parseEther("1.0"))  // Bet amount (encrypted!)
  .encrypt();

// Submit prediction (no one can see it!)
await market.commitPrediction(
  encryptedInput.handles[0],
  encryptedInput.handles[1],
  encryptedInput.inputProof,
  encryptedInput.inputProof,
  { value: ethers.parseEther("1.0") }
);
```

### 3️⃣ Aggregate & Decrypt (Homomorphic)

```typescript
// Anyone can trigger after commitment deadline
await market.aggregateBets(); // Homomorphic aggregation

// Request async decryption via Zama Gateway
await market.requestAggregateDecryption();

// Gateway + KMS automatically calls callback
// callbackAggregateDecryption() reveals totals
```

### 4️⃣ Settle Market

```typescript
// Event Market: Owner proposes outcome (24h challenge period)
await market.depositOwnerStake({ value: ethers.parseEther("0.5") });
await market.proposeSettlement(true); // YES wins
// ... wait 24 hours ...
await market.finalizeSettlement();

// Price Market: Anyone triggers Chainlink settlement
await market.settlePriceMarket(); // Fetches price from Chainlink
```

### 5️⃣ Claim Rewards (FHE Decryption)

```typescript
// Winner decrypts their prediction via EIP-712 signature
await market.claimRewards();

// Gateway decrypts and verifies winner
// Payout = (userAmount / totalWinningAmount) * totalPool
```

---

## 🔐 FHE Operations Explained

### Homomorphic Aggregation

```solidity
// Aggregate encrypted bets WITHOUT decryption
for (uint256 i = 0; i < participants.length; i++) {
    euint8 prediction = commitments[participant].encryptedPrediction;
    euint64 amount = commitments[participant].encryptedAmount;

    // Create flags: isYes = 1 if prediction == 1, else 0
    euint8 isYes = prediction;
    euint8 isNo = FHE.sub(FHE.asEuint8(1), prediction);

    // Calculate contributions using homomorphic multiplication
    euint64 yesContribution = FHE.mul(amount, FHE.asEuint64(isYes));
    euint64 noContribution = FHE.mul(amount, FHE.asEuint64(isNo));

    // Add to running totals using homomorphic addition
    encryptedTotalYes = FHE.add(encryptedTotalYes, yesContribution);
    encryptedTotalNo = FHE.add(encryptedTotalNo, noContribution);
}
```

### Async Decryption

```solidity
// Request decryption via Zama Gateway
bytes32[] memory cts = new bytes32[](2);
cts[0] = FHE.toBytes32(encryptedTotalYes);
cts[1] = FHE.toBytes32(encryptedTotalNo);

uint256 requestId = FHE.requestDecryption(
    cts,
    this.callbackAggregateDecryption.selector
);

// Gateway + KMS calls callback with decrypted values
function callbackAggregateDecryption(
    uint256 requestId,
    bytes memory cleartexts,
    bytes memory decryptionProof
) public {
    FHE.checkSignatures(requestId, cleartexts, decryptionProof);
    (uint64 totalYes, uint64 totalNo) = abi.decode(cleartexts, (uint64, uint64));
    // Now we have decrypted totals!
}
```

---

## 🏗️ Project Structure

```
privacy-predict-market/
├── contracts/
│   ├── BlindOracle.sol              # Core FHE prediction market
│   ├── ChainlinkPriceOracle.sol     # Chainlink integration
│   ├── MarketFactory.sol            # Market creation factory
│   └── mocks/
│       └── MockChainlinkAggregator.sol  # For testing
├── frontend/
│   ├── src/
│   │   ├── pages/                   # React pages
│   │   ├── hooks/                   # Custom hooks (FHE, Chainlink)
│   │   └── lib/                     # FHE decryption utilities
│   └── package.json
├── test/
│   ├── BlindOracle.ts               # Core contract tests (14 tests)
│   └── PriceMarket.ts               # Chainlink integration tests (9 tests)
├── scripts/
│   └── deploy-with-chainlink.ts     # Deployment script
└── README.md
```

---

## 🗺️ Roadmap

### ✅ Current Features (v1.0)

- ✅ **FHE Encrypted Predictions**: Fully private commitment phase
- ✅ **Homomorphic Aggregation**: Calculate totals without decryption
- ✅ **Dual Market Types**: Event markets + Price markets
- ✅ **Chainlink Integration**: Decentralized price oracles
- ✅ **Challenge Mechanism**: 24-hour challenge period for event markets
- ✅ **Proportional Payouts**: Fair reward distribution

### 🚧 Upcoming Features (v2.0)

#### AMM Trading Phase (In Development)

After price discovery, users will be able to trade YES/NO tokens using an **Automated Market Maker (AMM)**:

**Features**:
- 📈 **Constant Product AMM**: `k = reserveYes * reserveNo`
- 💱 **Dynamic Pricing**: Prices adjust based on supply/demand
- 🔄 **Buy/Sell Tokens**: Trade positions before settlement
- 🛡️ **Slippage Protection**: `minTokensOut` / `minEthOut` parameters
- 📊 **Real-time Quotes**: `getYesBuyQuote()` / `getYesSellQuote()`

**Example Usage**:
```solidity
// Buy YES tokens with ETH
await market.buyYesTokens(minTokensOut, { value: ethAmount });

// Sell YES tokens for ETH
await market.sellYesTokens(tokenAmount, minEthOut);

// Get current price quote
const quote = await market.getYesBuyQuote(ethers.parseEther("1.0"));
```

**Benefits**:
- 🎯 **Price Discovery**: Market-driven pricing reflects real-time sentiment
- 💰 **Liquidity**: Users can exit positions early
- 📉 **Risk Management**: Hedge or take profits before settlement
- 🔀 **Arbitrage**: Efficient price discovery through trading

#### Other Planned Features

- 🌐 **Multi-Outcome Markets**: Support for >2 outcomes (e.g., A/B/C/D)
- 🏆 **Leaderboards**: Track top predictors and earnings
- � **Cross-Chain**: Deploy to multiple EVM chains
- 📊 **Analytics Dashboard**: Historical data and market insights

---

## 📚 Resources

- **Zama fhEVM Docs**: https://docs.zama.ai/protocol
- **Chainlink Price Feeds**: https://docs.chain.link/data-feeds
- **Live Deployment**: [Sepolia Etherscan](https://sepolia.etherscan.io/address/0xb8b3a26AD1a1213Cf8c0509442E7B0C766Bd1ebB)

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file

---

## 🙏 Acknowledgments

Special thanks to:
- **Zama** for the groundbreaking fhEVM technology
- **Chainlink** for decentralized oracle infrastructure
- **Ethereum Community** for the robust ecosystem

---

**🔮 The Blind Oracle - Where Privacy Meets Prediction**
