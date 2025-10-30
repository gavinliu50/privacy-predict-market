import { ethers } from "hardhat";

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

  console.log("\n🎉 Deployment complete!");
  console.log("\n📋 Next steps:");
  console.log("1. Users can commit predictions during the commitment phase");
  console.log("   - Call commitPrediction() with encrypted prediction and amount");
  console.log("2. Owner aggregates bets after commitment deadline");
  console.log("   - Call aggregateBets()");
  console.log("3. Owner requests decryption to discover initial price");
  console.log("   - Call requestAggregateDecryption()");
  console.log("4. Gateway calls callback with decrypted values");
  console.log("   - callbackAggregateDecryption() is called automatically");
  console.log("5. Users request token allocation");
  console.log("   - Call requestTokenAllocation()");
  console.log("6. Users can trade YES/NO tokens in the free trading phase");
  console.log("   - Call buyYesTokens(), buyNoTokens(), sellYesTokens(), sellNoTokens()");
  console.log("7. Owner settles market after event occurs");
  console.log("   - Call settleMarket(outcome)");
  console.log("8. Winners claim their rewards");
  console.log("   - Call claimRewards()");

  console.log("\n💡 Useful commands:");
  console.log(`npx hardhat verify --network sepolia ${contractAddress} "${EVENT_DESCRIPTION}" ${COMMITMENT_DURATION} ${EVENT_DURATION}`);
  console.log("\n");

  // Save deployment info
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

  console.log("\n📄 Deployment Info (save this):");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

