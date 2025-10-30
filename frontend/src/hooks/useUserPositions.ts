import { useState, useEffect } from 'react';
import { useAccount, useReadContract, usePublicClient } from 'wagmi';
import MarketFactoryABI from '../MarketFactoryABI.json';
import BlindOracleABI from '../BlindOracleABI.json';
import { CONTRACT_CONFIG } from '../config';

const MARKET_FACTORY_ADDRESS = CONTRACT_CONFIG.factoryAddress;

export interface UserPosition {
  marketAddress: string;
  description: string;
  phase: number;
  commitmentDeadline: bigint;
  eventDeadline: bigint;
  totalPool: bigint;
  participantCount: bigint;
  hasCommitted: boolean;
  hasClaimed: boolean;
  isSettled: boolean;
  finalOutcome?: boolean;
  totalYesAmount?: bigint;
  totalNoAmount?: bigint;
  isAggregated?: boolean;
}

export function useUserPositions() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Get total market count
  const { data: marketCount } = useReadContract({
    address: MARKET_FACTORY_ADDRESS,
    abi: MarketFactoryABI.abi,
    functionName: 'getMarketCount',
  });

  // Get market list
  const { data: marketAddresses } = useReadContract({
    address: MARKET_FACTORY_ADDRESS,
    abi: MarketFactoryABI.abi,
    functionName: 'getMarkets',
    args: [0n, marketCount || 100n],
    query: {
      enabled: !!marketCount && Number(marketCount) > 0,
    },
  });

  useEffect(() => {
    if (!isConnected || !address || !marketAddresses || !publicClient) {
      setIsLoading(false);
      setPositions([]);
      return;
    }

    loadUserPositions();
  }, [isConnected, address, marketAddresses, publicClient]);

  const loadUserPositions = async () => {
    if (!marketAddresses || !address || !publicClient) return;

    setIsLoading(true);
    setError(null);

    try {
      const userPositions: UserPosition[] = [];

      // Iterate through all markets
      for (const marketAddr of marketAddresses as `0x${string}`[]) {
        if (marketAddr === '0x0000000000000000000000000000000000000000') continue;

        try {
          // Check if user participated in this market
          const hasCommitted = await publicClient.readContract({
            address: marketAddr,
            abi: BlindOracleABI.abi,
            functionName: 'hasUserCommitted',
            args: [address],
          }) as boolean;

          if (!hasCommitted) {
            continue;
          }

          // Get market information
          const [factoryInfo, marketInfo] = await Promise.all([
            publicClient.readContract({
              address: MARKET_FACTORY_ADDRESS,
              abi: MarketFactoryABI.abi,
              functionName: 'getMarketInfo',
              args: [marketAddr],
            }) as Promise<any>,
            publicClient.readContract({
              address: marketAddr,
              abi: BlindOracleABI.abi,
              functionName: 'getMarketInfo',
            }) as Promise<any>,
          ]);

          // 获取其他数据
          const [totalPool, participantCount, hasClaimed, isAggregated] = await Promise.all([
            publicClient.readContract({
              address: marketAddr,
              abi: BlindOracleABI.abi,
              functionName: 'getBalance',
            }) as Promise<bigint>,
            publicClient.readContract({
              address: marketAddr,
              abi: BlindOracleABI.abi,
              functionName: 'getParticipantCount',
            }) as Promise<bigint>,
            publicClient.readContract({
              address: marketAddr,
              abi: BlindOracleABI.abi,
              functionName: 'hasClaimed',
              args: [address],
            }) as Promise<boolean>,
            publicClient.readContract({
              address: marketAddr,
              abi: BlindOracleABI.abi,
              functionName: 'isAggregated',
            }) as Promise<boolean>,
          ]);

          // 解析 marketInfo
          const [phase, commitmentDeadline, eventDeadline, totalYesAmount, totalNoAmount, isSettled, finalOutcome] = marketInfo;

          // 解析 factoryInfo
          const [, description] = factoryInfo;

          const position = {
            marketAddress: marketAddr,
            description: description as string,
            phase: Number(phase),
            commitmentDeadline: commitmentDeadline as bigint,
            eventDeadline: eventDeadline as bigint,
            totalPool,
            participantCount,
            hasCommitted: true,
            hasClaimed,
            isSettled: isSettled as boolean,
            finalOutcome: finalOutcome as boolean,
            totalYesAmount: totalYesAmount as bigint,
            totalNoAmount: totalNoAmount as bigint,
            isAggregated,
          };

          userPositions.push(position);
        } catch (err) {
          // Continue to next market on error
        }
      }

      setPositions(userPositions);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  // Separate active and settled positions
  const activePositions = positions.filter((p) => !p.isSettled);
  const settledPositions = positions.filter((p) => p.isSettled);

  return {
    positions,
    activePositions,
    settledPositions,
    isLoading,
    error,
    refetch: loadUserPositions,
  };
}

