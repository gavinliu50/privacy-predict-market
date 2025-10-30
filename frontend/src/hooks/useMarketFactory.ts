import { useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACT_CONFIG } from '../config';
import MarketFactoryABI from '../MarketFactoryABI.json';

export interface MarketInfo {
  marketAddress: string;
  creator: string;
  description: string;
  commitmentDeadline: bigint;
  eventDeadline: bigint;
  createdAt: bigint;
  isActive: boolean;
}

export function useMarketFactory() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  // 读取市场总数
  const { data: marketCount, refetch: refetchMarketCount } = useReadContract({
    address: CONTRACT_CONFIG.factoryAddress,
    abi: MarketFactoryABI.abi,
    functionName: 'getMarketCount',
  });

  // 创建新市场
  const createMarket = async (
    marketType: 0 | 1, // 0 = Event, 1 = Price
    description: string,
    commitmentDuration: number, // in seconds
    eventDuration: number, // in seconds
    priceOracle: `0x${string}`, // Price oracle address (use 0x0 for Event markets)
    targetAsset: 0 | 1 | 2, // 0 = ETH, 1 = BTC, 2 = SOL
    targetPrice: bigint // Target price scaled by 1e8 (use 0 for Event markets)
  ) => {
    try {
      await writeContract({
        address: CONTRACT_CONFIG.factoryAddress,
        abi: MarketFactoryABI.abi,
        functionName: 'createMarket',
        args: [
          marketType,
          description,
          BigInt(commitmentDuration),
          BigInt(eventDuration),
          priceOracle,
          targetAsset,
          targetPrice,
        ],
      });
    } catch (err) {
      throw err;
    }
  };

  return {
    // State
    marketCount,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,

    // Actions
    createMarket,
    refetchMarketCount,
  };
}

// Hook to get market list
export function useMarketList(offset: number = 0, limit: number = 10) {
  const { data: markets, refetch, isLoading } = useReadContract({
    address: CONTRACT_CONFIG.factoryAddress,
    abi: MarketFactoryABI.abi,
    functionName: 'getMarkets',
    args: [BigInt(offset), BigInt(limit)],
  });

  return {
    markets: markets as string[] | undefined,
    refetch,
    isLoading,
  };
}

// Hook to get market info
export function useMarketInfo(marketAddress: `0x${string}` | undefined) {
  const { data: marketInfo, refetch, isLoading } = useReadContract({
    address: CONTRACT_CONFIG.factoryAddress,
    abi: MarketFactoryABI.abi,
    functionName: 'getMarketInfo',
    args: marketAddress ? [marketAddress] : undefined,
    query: {
      enabled: !!marketAddress,
    },
  });

  return {
    marketInfo: marketInfo as [string, string, bigint, bigint, bigint, boolean] | undefined,
    refetch,
    isLoading,
  };
}

// Hook to get user's markets
export function useUserMarkets(userAddress: `0x${string}` | undefined) {
  const { data: markets, refetch, isLoading } = useReadContract({
    address: CONTRACT_CONFIG.factoryAddress,
    abi: MarketFactoryABI.abi,
    functionName: 'getUserMarkets',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress,
    },
  });

  return {
    markets: markets as string[] | undefined,
    refetch,
    isLoading,
  };
}

