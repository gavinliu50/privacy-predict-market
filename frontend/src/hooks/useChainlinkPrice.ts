import { useReadContract } from 'wagmi';
import ChainlinkPriceOracleABI from '../ChainlinkPriceOracleABI.json';

// Asset enum matching the contract
export enum Asset {
  ETH = 0,
  BTC = 1,
  SOL = 2,
}

export function useChainlinkPrice(oracleAddress: `0x${string}` | undefined, asset: Asset) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: oracleAddress,
    abi: ChainlinkPriceOracleABI.abi,
    functionName: 'getPrice',
    args: [asset],
    query: {
      enabled: !!oracleAddress,
      refetchInterval: 10000, // 每10秒刷新一次
    },
  });

  // data 是一个数组 [price, timestamp]
  const price = data ? (data as any)[0] : undefined;
  const timestamp = data ? (data as any)[1] : undefined;

  // 将价格从 1e8 格式转换为美元
  const priceInUsd = price ? Number(price) / 1e8 : undefined;

  // 计算价格更新时间
  const lastUpdated = timestamp ? new Date(Number(timestamp) * 1000) : undefined;

  return {
    price: priceInUsd,
    rawPrice: price,
    timestamp: lastUpdated,
    isLoading,
    error,
    refetch,
  };
}

