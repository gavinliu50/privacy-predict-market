import { ethers } from 'hardhat';

async function main() {
  const priceOracleAddress = '0x40848462B928B034854c2aE1240711Aae79CF251';
  
  const PriceOracle = await ethers.getContractAt('PriceOracle', priceOracleAddress);
  
  // 获取当前 ETH 价格（从 Coinbase API）
  const response = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot');
  const data = await response.json();
  const ethPrice = parseFloat(data.data.amount);
  
  console.log(`Current ETH price: $${ethPrice}`);
  
  // 转换为 1e8 格式
  const priceInOracle = Math.floor(ethPrice * 1e8);
  
  console.log(`Updating oracle price to: ${priceInOracle} (${ethPrice} USD)`);
  
  // 更新价格
  const tx = await PriceOracle.updatePrice(0, priceInOracle); // 0 = ETH
  await tx.wait();
  
  console.log('✅ Price updated successfully!');
  console.log(`Transaction hash: ${tx.hash}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

