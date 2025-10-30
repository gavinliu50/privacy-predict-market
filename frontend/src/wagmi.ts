import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia, hardhat } from 'wagmi/chains';
import { http } from 'wagmi';

// 自定义 Sepolia 配置，使用多个 RPC 端点避免限流
const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: {
      http: [
        'https://ethereum-sepolia-rpc.publicnode.com',
        'https://rpc.sepolia.org',
        'https://sepolia.gateway.tenderly.co',
        'https://rpc2.sepolia.org',
      ],
    },
    public: {
      http: [
        'https://ethereum-sepolia-rpc.publicnode.com',
        'https://rpc.sepolia.org',
      ],
    },
  },
};

export const config = getDefaultConfig({
  appName: 'The Blind Oracle',
  projectId: 'YOUR_PROJECT_ID', // Get from https://cloud.walletconnect.com
  chains: [customSepolia, hardhat],
  transports: {
    [sepolia.id]: http('https://ethereum-sepolia-rpc.publicnode.com'),
    [hardhat.id]: http('http://127.0.0.1:8545'),
  },
  ssr: false,
});

