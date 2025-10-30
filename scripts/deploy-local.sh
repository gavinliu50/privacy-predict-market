#!/bin/bash

echo "🚀 Starting local deployment..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 读取私钥
PRIVATE_KEY=$(cat deployer_private_key.txt)
echo "✅ Loaded deployer private key"

# 启动 Hardhat 节点（后台运行）
echo "🔧 Starting Hardhat node..."
npx hardhat node > hardhat-node.log 2>&1 &
NODE_PID=$!
echo "📝 Hardhat node PID: $NODE_PID"

# 等待节点启动
echo "⏳ Waiting for node to start..."
sleep 5

# 部署合约
echo "📦 Deploying BlindOracle contract..."
npx hardhat run scripts/deploy.ts --network localhost

# 保存节点 PID
echo $NODE_PID > .hardhat-node.pid
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment complete!"
echo "📝 Hardhat node is running in background (PID: $NODE_PID)"
echo "📋 To stop the node: kill $NODE_PID"
echo "📋 Or run: kill \$(cat .hardhat-node.pid)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

