import { ethers } from 'hardhat';

async function main() {
  // 使用已部署的 Chainlink 集成的 Factory
  const factoryAddress = '0xf273373A33A3F885162b97ce7Ba623650AF9Bda2';
  const chainlinkOracleAddress = '0xb7d83D98B1C0162DeBADa920577F7a73CfB61Bea';
  
  const MarketFactory = await ethers.getContractAt('MarketFactory', factoryAddress);
  
  console.log('Creating a new Price Market with Chainlink oracle...');
  
  // 市场参数
  const description = 'Will ETH reach $4,200 by end of today?';
  const commitmentDeadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const eventDeadline = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now
  const targetAsset = 0; // ETH
  const targetPrice = 420000000000; // $4,200 in 1e8 format
  
  console.log('Market parameters:');
  console.log('- Description:', description);
  console.log('- Commitment Deadline:', new Date(commitmentDeadline * 1000).toLocaleString());
  console.log('- Event Deadline:', new Date(eventDeadline * 1000).toLocaleString());
  console.log('- Target Asset: ETH');
  console.log('- Target Price: $4,200');
  console.log('- Oracle:', chainlinkOracleAddress);
  
  // 创建市场
  const tx = await MarketFactory.createPriceMarket(
    description,
    commitmentDeadline,
    eventDeadline,
    chainlinkOracleAddress,
    targetAsset,
    targetPrice
  );
  
  console.log('\n⏳ Waiting for transaction confirmation...');
  const receipt = await tx.wait();
  
  // 获取市场地址
  const event = receipt.logs.find((log: any) => {
    try {
      const parsed = MarketFactory.interface.parseLog(log);
      return parsed?.name === 'MarketCreated';
    } catch {
      return false;
    }
  });
  
  if (event) {
    const parsed = MarketFactory.interface.parseLog(event);
    const marketAddress = parsed?.args[0];
    
    console.log('\n✅ Price Market created successfully!');
    console.log('📍 Market Address:', marketAddress);
    console.log('🔗 View on Sepolia Etherscan:', `https://sepolia.etherscan.io/address/${marketAddress}`);
    console.log('\n🌐 Open in your app:', `http://localhost:5173/market/${marketAddress}`);
  } else {
    console.log('✅ Transaction successful but could not find market address');
    console.log('Transaction hash:', tx.hash);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

