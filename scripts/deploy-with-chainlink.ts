import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n🚀 Deploying Chainlink Price Oracle and Market Factory...");
  console.log("━".repeat(60));

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  
  // Get network info
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log(`Network: ${network.name} (Chain ID: ${chainId})`);
  console.log("━".repeat(60));

  // Chainlink Price Feed addresses
  let ethUsdFeed: string;
  let btcUsdFeed: string;
  let solUsdFeed: string;

  if (chainId === 11155111) {
    // Sepolia Testnet
    console.log("\n📡 Using Chainlink Price Feeds on Sepolia:");
    ethUsdFeed = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
    btcUsdFeed = "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43";
    solUsdFeed = ethers.ZeroAddress; // SOL/USD not available on Sepolia
    
    console.log(`  ETH/USD: ${ethUsdFeed}`);
    console.log(`  BTC/USD: ${btcUsdFeed}`);
    console.log(`  SOL/USD: Not available (using address(0))`);
  } else if (chainId === 1) {
    // Ethereum Mainnet
    console.log("\n📡 Using Chainlink Price Feeds on Mainnet:");
    ethUsdFeed = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
    btcUsdFeed = "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c";
    solUsdFeed = "0x4ffC43a60e009B551865A93d232E33Fce9f01507";
    
    console.log(`  ETH/USD: ${ethUsdFeed}`);
    console.log(`  BTC/USD: ${btcUsdFeed}`);
    console.log(`  SOL/USD: ${solUsdFeed}`);
  } else {
    throw new Error(`Unsupported network: ${network.name} (Chain ID: ${chainId})`);
  }
  console.log("━".repeat(60));

  // Step 1: Deploy ChainlinkPriceOracle
  console.log("\n📊 Step 1: Deploying ChainlinkPriceOracle...");
  const ChainlinkPriceOracle = await ethers.getContractFactory("ChainlinkPriceOracle");
  const priceOracle = await ChainlinkPriceOracle.deploy(
    ethUsdFeed,
    btcUsdFeed,
    solUsdFeed
  );
  await priceOracle.waitForDeployment();
  const priceOracleAddress = await priceOracle.getAddress();
  
  console.log(`✅ ChainlinkPriceOracle deployed: ${priceOracleAddress}`);
  
  // Verify price feeds are working
  try {
    console.log("\n📈 Verifying Price Feeds:");
    
    // Get ETH price
    const [ethPrice, ethTimestamp] = await priceOracle.getPrice(0);
    console.log(`  ETH: $${(Number(ethPrice) / 1e8).toLocaleString()} (Updated: ${new Date(Number(ethTimestamp) * 1000).toLocaleString()})`);
    
    // Get BTC price
    const [btcPrice, btcTimestamp] = await priceOracle.getPrice(1);
    console.log(`  BTC: $${(Number(btcPrice) / 1e8).toLocaleString()} (Updated: ${new Date(Number(btcTimestamp) * 1000).toLocaleString()})`);
    
    // Get SOL price (if available)
    if (solUsdFeed !== ethers.ZeroAddress) {
      const [solPrice, solTimestamp] = await priceOracle.getPrice(2);
      console.log(`  SOL: $${(Number(solPrice) / 1e8).toLocaleString()} (Updated: ${new Date(Number(solTimestamp) * 1000).toLocaleString()})`);
    } else {
      console.log(`  SOL: Not available on this network`);
    }
  } catch (error: any) {
    console.log(`⚠️ Warning: Could not verify prices: ${error.message}`);
  }
  console.log("━".repeat(60));

  // Step 2: Deploy MarketFactory
  console.log("\n🏭 Step 2: Deploying MarketFactory...");
  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const marketFactory = await MarketFactory.deploy();
  await marketFactory.waitForDeployment();
  const factoryAddress = await marketFactory.getAddress();
  
  console.log(`✅ MarketFactory deployed: ${factoryAddress}`);
  console.log("━".repeat(60));

  // Step 3: Create a test Event Market
  console.log("\n📝 Step 3: Creating test Event Market...");
  const eventDescription = "Will Bitcoin reach $120,000 by end of 2025?";
  const commitmentDuration = 3600; // 1 hour
  const eventDuration = 3600 * 24; // 24 hours
  
  const tx1 = await marketFactory.createMarket(
    0, // MarketType.Event
    eventDescription,
    commitmentDuration,
    eventDuration,
    ethers.ZeroAddress, // No oracle for event market
    0, // No asset
    0  // No target price
  );
  await tx1.wait();
  
  const eventMarketAddress = await marketFactory.markets(0);
  console.log(`✅ Event Market created: ${eventMarketAddress}`);
  console.log(`   Description: ${eventDescription}`);
  console.log(`   Commitment Duration: ${commitmentDuration / 3600} hour(s)`);
  console.log(`   Event Duration: ${eventDuration / 3600} hour(s)`);
  console.log("━".repeat(60));

  // Step 4: Create a test Price Market
  console.log("\n💰 Step 4: Creating test Price Market...");
  const priceDescription = "Will ETH price be above $5,000 on December 31, 2024?";
  const targetPrice = 5000_00000000; // $5,000 (scaled by 1e8)
  
  const tx2 = await marketFactory.createMarket(
    1, // MarketType.Price
    priceDescription,
    commitmentDuration,
    eventDuration,
    priceOracleAddress,
    0, // Asset.ETH
    targetPrice
  );
  await tx2.wait();
  
  const priceMarketAddress = await marketFactory.markets(1);
  console.log(`✅ Price Market created: ${priceMarketAddress}`);
  console.log(`   Description: ${priceDescription}`);
  console.log(`   Target Asset: ETH`);
  console.log(`   Target Price: $${(targetPrice / 1e8).toLocaleString()}`);
  console.log("━".repeat(60));

  // Step 5: Save deployment info
  console.log("\n💾 Step 5: Saving deployment info...");
  
  const deploymentInfo = {
    network: network.name,
    chainId: chainId,
    deployer: deployer.address,
    contracts: {
      chainlinkPriceOracle: priceOracleAddress,
      marketFactory: factoryAddress,
    },
    chainlinkFeeds: {
      ethUsd: ethUsdFeed,
      btcUsd: btcUsdFeed,
      solUsd: solUsdFeed !== ethers.ZeroAddress ? solUsdFeed : "Not available",
    },
    testMarkets: {
      eventMarket: eventMarketAddress,
      priceMarket: priceMarketAddress,
    },
    deploymentTime: new Date().toISOString(),
  };

  // Save to root directory
  const deploymentPath = path.join(__dirname, "../DEPLOYMENT_INFO.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`✅ Saved deployment info to: ${deploymentPath}`);

  // Step 6: Update frontend config
  console.log("\n🔧 Step 6: Updating frontend config...");
  const configPath = path.join(__dirname, "../frontend/src/config.ts");
  
  const configContent = `// Contract Configuration
// Auto-generated by deployment script

export const CONTRACT_CONFIG = {
  factoryAddress: '${factoryAddress}' as \`0x\${string}\`,
  priceOracleAddress: '${priceOracleAddress}' as \`0x\${string}\`,
  chainId: ${chainId},
  chainName: '${network.name}',
};

// Chainlink Price Feeds
export const CHAINLINK_FEEDS = {
  ethUsd: '${ethUsdFeed}',
  btcUsd: '${btcUsdFeed}',
  solUsd: '${solUsdFeed !== ethers.ZeroAddress ? solUsdFeed : 'Not available'}',
};

// Test Markets (for development)
export const TEST_MARKETS = {
  eventMarket: '${eventMarketAddress}',
  priceMarket: '${priceMarketAddress}',
};
`;

  fs.writeFileSync(configPath, configContent);
  console.log(`✅ Updated frontend config: ${configPath}`);

  // Step 7: Generate ABIs
  console.log("\n📄 Step 7: Generating ABIs...");
  
  // Read compiled artifacts
  const BlindOracleArtifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../artifacts/contracts/BlindOracle.sol/BlindOracle.json"),
      "utf-8"
    )
  );
  
  const MarketFactoryArtifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../artifacts/contracts/MarketFactory.sol/MarketFactory.json"),
      "utf-8"
    )
  );
  
  const ChainlinkPriceOracleArtifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../artifacts/contracts/ChainlinkPriceOracle.sol/ChainlinkPriceOracle.json"),
      "utf-8"
    )
  );

  // Save ABIs to frontend
  const frontendAbiPath = path.join(__dirname, "../frontend/src");
  
  fs.writeFileSync(
    path.join(frontendAbiPath, "BlindOracleABI.json"),
    JSON.stringify({ abi: BlindOracleArtifact.abi }, null, 2)
  );
  
  fs.writeFileSync(
    path.join(frontendAbiPath, "MarketFactoryABI.json"),
    JSON.stringify({ abi: MarketFactoryArtifact.abi }, null, 2)
  );
  
  fs.writeFileSync(
    path.join(frontendAbiPath, "ChainlinkPriceOracleABI.json"),
    JSON.stringify({ abi: ChainlinkPriceOracleArtifact.abi }, null, 2)
  );

  console.log(`✅ Saved ABIs to: ${frontendAbiPath}`);
  console.log("   - BlindOracleABI.json");
  console.log("   - MarketFactoryABI.json");
  console.log("   - ChainlinkPriceOracleABI.json");
  console.log("━".repeat(60));

  // Final summary
  console.log("\n🎉 Deployment Complete!");
  console.log("━".repeat(60));
  console.log("\n📋 Contract Addresses:");
  console.log(`  ChainlinkPriceOracle: ${priceOracleAddress}`);
  console.log(`  MarketFactory:        ${factoryAddress}`);
  console.log(`  Event Market:         ${eventMarketAddress}`);
  console.log(`  Price Market:         ${priceMarketAddress}`);
  
  console.log("\n📡 Chainlink Price Feeds:");
  console.log(`  ETH/USD: ${ethUsdFeed}`);
  console.log(`  BTC/USD: ${btcUsdFeed}`);
  console.log(`  SOL/USD: ${solUsdFeed !== ethers.ZeroAddress ? solUsdFeed : 'Not available'}`);
  
  console.log("\n📋 Next Steps:");
  console.log("1. Frontend config has been updated automatically");
  console.log("2. ABIs have been generated and saved");
  console.log("3. Start the frontend: cd frontend && npm run dev");
  console.log("4. Connect your wallet to the correct network");
  console.log("5. Test creating markets and submitting predictions");
  
  console.log("\n💡 Benefits of Chainlink:");
  console.log("✅ Decentralized - Multiple nodes provide price data");
  console.log("✅ Automatic - Prices update automatically");
  console.log("✅ Reliable - Battle-tested in production");
  console.log("✅ Free on testnet - No LINK tokens required");
  console.log("\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

