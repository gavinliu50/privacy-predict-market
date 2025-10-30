import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying MarketFactory...");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);

  // Get account balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "ETH");

  // Deploy MarketFactory
  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const factory = await MarketFactory.deploy();
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log("✅ MarketFactory deployed to:", factoryAddress);

  // Create a test market
  console.log("\n🎯 Creating a test market...");
  
  const description = "Will Bitcoin reach $120,000 by end of 2025?";
  const commitmentDuration = 7 * 24 * 60 * 60; // 7 days
  const eventDuration = 365 * 24 * 60 * 60; // 365 days

  const tx = await factory.createMarket(
    description,
    commitmentDuration,
    eventDuration
  );
  
  const receipt = await tx.wait();
  console.log("✅ Test market created!");

  // Get the market address from the event
  const event = receipt?.logs.find((log: any) => {
    try {
      return factory.interface.parseLog(log)?.name === "MarketCreated";
    } catch {
      return false;
    }
  });

  if (event) {
    const parsedEvent = factory.interface.parseLog(event);
    const marketAddress = parsedEvent?.args[0];
    console.log("📍 Test market address:", marketAddress);
  }

  // Get market count
  const marketCount = await factory.getMarketCount();
  console.log("📊 Total markets:", marketCount.toString());

  console.log("\n✅ Deployment complete!");
  console.log("\n📋 Summary:");
  console.log("   Factory Address:", factoryAddress);
  console.log("   Network:", (await ethers.provider.getNetwork()).name);
  console.log("   Chain ID:", (await ethers.provider.getNetwork()).chainId);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

