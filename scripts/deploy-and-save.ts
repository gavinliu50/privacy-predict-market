import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n🚀 Deploying BlindOracle Prediction Market...");
  console.log("━".repeat(60));

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

  // Market parameters
  const EVENT_DESCRIPTION = "Will Bitcoin reach $100,000 by end of 2025?";
  const COMMITMENT_DURATION = 3600 * 24; // 24 hours
  const EVENT_DURATION = 3600 * 24 * 365; // 1 year

  console.log("\n📝 Market Parameters:");
  console.log(`Event: ${EVENT_DESCRIPTION}`);
  console.log(`Commitment Duration: ${COMMITMENT_DURATION / 3600} hours`);
  console.log(`Event Duration: ${EVENT_DURATION / (3600 * 24)} days`);
  console.log("━".repeat(60));

  // Deploy contract
  console.log("\n⏳ Deploying contract...");
  const BlindOracle = await ethers.getContractFactory("BlindOracle");
  const blindOracle = await BlindOracle.deploy(
    EVENT_DESCRIPTION,
    COMMITMENT_DURATION,
    EVENT_DURATION
  );

  await blindOracle.waitForDeployment();
  const contractAddress = await blindOracle.getAddress();

  console.log("\n✅ BlindOracle deployed successfully!");
  console.log("━".repeat(60));
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Transaction Hash: ${blindOracle.deploymentTransaction()?.hash}`);
  console.log("━".repeat(60));

  // Get market info
  const marketInfo = await blindOracle.getMarketInfo();
  console.log("\n📊 Market Info:");
  console.log(`Current Phase: ${["BlindCommitment", "Aggregating", "AwaitingDecryption", "FreeTrading", "Settled"][Number(marketInfo.phase)]}`);
  console.log(`Commitment Deadline: ${new Date(Number(marketInfo._commitmentDeadline) * 1000).toLocaleString()}`);
  console.log(`Event Deadline: ${new Date(Number(marketInfo._eventDeadline) * 1000).toLocaleString()}`);
  console.log("━".repeat(60));

  // Save deployment info to frontend config
  const configPath = path.join(__dirname, "../frontend/src/config.ts");
  let configContent = fs.readFileSync(configPath, "utf-8");
  
  // Update contract address
  configContent = configContent.replace(
    /address: '0x[0-9a-fA-F]{40}'/,
    `address: '${contractAddress}'`
  );
  
  fs.writeFileSync(configPath, configContent);
  console.log("\n✅ Updated frontend config with contract address!");

  // Save full deployment info
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    contractAddress: contractAddress,
    deployer: deployer.address,
    eventDescription: EVENT_DESCRIPTION,
    commitmentDuration: COMMITMENT_DURATION,
    eventDuration: EVENT_DURATION,
    deploymentTime: new Date().toISOString(),
    transactionHash: blindOracle.deploymentTransaction()?.hash,
  };

  const deploymentPath = path.join(__dirname, "../deployment-info.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`✅ Saved deployment info to: ${deploymentPath}`);

  console.log("\n🎉 Deployment complete!");
  console.log("\n📋 Next steps:");
  console.log("1. Frontend config has been updated automatically");
  console.log("2. Start the frontend: cd frontend && npm run dev");
  console.log("3. Connect your wallet to localhost:8545");
  console.log("4. Import the deployer account to MetaMask:");
  console.log("   Private Key: (see deployer_private_key.txt)");
  console.log("\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

