import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Market parameters
  const EVENT_DESCRIPTION = "Will Bitcoin reach $100,000 by end of 2025?";
  const COMMITMENT_DURATION = 3600 * 24; // 24 hours
  const EVENT_DURATION = 3600 * 24 * 365; // 1 year

  console.log("\n📝 Deploying BlindOracle Prediction Market...");
  console.log("━".repeat(60));
  console.log(`Event: ${EVENT_DESCRIPTION}`);
  console.log(`Commitment Duration: ${COMMITMENT_DURATION / 3600} hours`);
  console.log(`Event Duration: ${EVENT_DURATION / (3600 * 24)} days`);
  console.log("━".repeat(60));

  const blindOracle = await deploy("BlindOracle", {
    from: deployer,
    args: [EVENT_DESCRIPTION, COMMITMENT_DURATION, EVENT_DURATION],
    log: true,
    autoMine: true,
  });

  console.log("\n✅ BlindOracle deployed successfully!");
  console.log("━".repeat(60));
  console.log(`Contract Address: ${blindOracle.address}`);
  console.log(`Deployer: ${deployer}`);
  console.log(`Network: ${hre.network.name}`);
  console.log("━".repeat(60));

  // Verify on Etherscan if on a live network
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\n⏳ Waiting for block confirmations...");
    await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds

    console.log("\n🔍 Verifying contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: blindOracle.address,
        constructorArguments: [EVENT_DESCRIPTION, COMMITMENT_DURATION, EVENT_DURATION],
      });
      console.log("✅ Contract verified on Etherscan!");
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log("ℹ️  Contract already verified on Etherscan");
      } else {
        console.error("❌ Verification failed:", error.message);
      }
    }
  }

  console.log("\n🎉 Deployment complete!");
  console.log("\n📋 Next steps:");
  console.log("1. Users can commit predictions during the commitment phase");
  console.log("2. Owner aggregates bets after commitment deadline");
  console.log("3. Owner requests decryption to discover initial price");
  console.log("4. Users can trade YES/NO tokens in the free trading phase");
  console.log("5. Owner settles market after event occurs");
  console.log("6. Winners claim their rewards\n");
};

export default func;
func.tags = ["BlindOracle"];

