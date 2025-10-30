import { useWriteContract, useReadContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { parseEther } from 'viem';
import { CONTRACT_CONFIG } from '../config';
import BlindOracleABI from '../BlindOracleABI.json';
import { useFhevm } from './useFhevm';

// Helper function: convert Uint8Array to hex string
function uint8ArrayToHex(arr: Uint8Array): `0x${string}` {
  return `0x${Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

export function useBlindOracle(marketAddress: `0x${string}` | undefined) {
  const { address } = useAccount();
  const { fhevmInstance } = useFhevm();
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash,
      query: {
        enabled: !!hash,
      },
    });

  // Read current phase
  const { data: currentPhase, refetch: refetchCurrentPhase } = useReadContract({
    address: marketAddress,
    abi: BlindOracleABI.abi,
    functionName: 'currentPhase',
    query: {
      enabled: !!marketAddress,
      refetchInterval: 5000, // Auto-refresh every 5 seconds
    },
  });

  // Read market information
  const { data: eventDescription, refetch: refetchEventDescription } = useReadContract({
    address: marketAddress,
    abi: BlindOracleABI.abi,
    functionName: 'eventDescription',
    query: {
      enabled: !!marketAddress,
      refetchInterval: 5000, // Auto-refresh every 5 seconds
    },
  });

  // Read contract balance (Total Pool)
  const { data: totalPool, refetch: refetchTotalPool } = useReadContract({
    address: marketAddress,
    abi: BlindOracleABI.abi,
    functionName: 'getBalance',
    query: {
      enabled: !!marketAddress,
      refetchInterval: 5000, // Auto-refresh every 5 seconds
    },
  });

  // Read participant count
  const { data: participantCount, refetch: refetchParticipantCount } = useReadContract({
    address: marketAddress,
    abi: BlindOracleABI.abi,
    functionName: 'getParticipantCount',
    query: {
      enabled: !!marketAddress,
      refetchInterval: 5000, // Auto-refresh every 5 seconds
    },
  });

  // Read complete market information
  const { data: marketInfo, refetch: refetchMarketInfo } = useReadContract({
    address: marketAddress,
    abi: BlindOracleABI.abi,
    functionName: 'getMarketInfo',
    query: {
      enabled: !!marketAddress,
      refetchInterval: 5000, // Auto-refresh every 5 seconds
    },
  });

  // Read market type
  const { data: marketType, refetch: refetchMarketType } = useReadContract({
    address: marketAddress,
    abi: BlindOracleABI.abi,
    functionName: 'marketType',
    query: {
      enabled: !!marketAddress,
    },
  });

  // Read price market information
  const { data: priceMarketInfo, refetch: refetchPriceMarketInfo } = useReadContract({
    address: marketAddress,
    abi: BlindOracleABI.abi,
    functionName: 'getPriceMarketInfo',
    query: {
      enabled: !!marketAddress && marketType === 1, // Only read for Price markets
    },
  });

  // Read settlement information
  const { data: settlementInfo, refetch: refetchSettlementInfo } = useReadContract({
    address: marketAddress,
    abi: BlindOracleABI.abi,
    functionName: 'getSettlementInfo',
    query: {
      enabled: !!marketAddress,
      refetchInterval: 5000, // Auto-refresh every 5 seconds
    },
  });

  // Parse marketInfo
  const commitmentDeadline = marketInfo ? (marketInfo as any)[1] : undefined;
  const eventDeadline = marketInfo ? (marketInfo as any)[2] : undefined;
  const totalYesAmount = marketInfo ? (marketInfo as any)[3] : undefined;
  const totalNoAmount = marketInfo ? (marketInfo as any)[4] : undefined;
  const isSettled = marketInfo ? (marketInfo as any)[5] : undefined;
  const finalOutcome = marketInfo ? (marketInfo as any)[6] : undefined;

  // Read if aggregated
  const { data: isAggregated, refetch: refetchIsAggregated } = useReadContract({
    address: marketAddress,
    abi: BlindOracleABI.abi,
    functionName: 'isAggregated',
    query: {
      enabled: !!marketAddress,
      refetchInterval: 5000,
    },
  });

  // Read if user has committed
  const { data: hasCommitted } = useReadContract({
    address: marketAddress,
    abi: BlindOracleABI.abi,
    functionName: 'hasUserCommitted',
    args: address ? [address] : undefined,
    query: {
      enabled: !!marketAddress && !!address,
      refetchInterval: 5000,
    },
  });

  // Read if user has claimed rewards
  const { data: hasClaimed } = useReadContract({
    address: marketAddress,
    abi: BlindOracleABI.abi,
    functionName: 'hasClaimed',
    args: address ? [address] : undefined,
    query: {
      enabled: !!marketAddress && !!address,
      refetchInterval: 5000,
    },
  });

  // Submit prediction
  const submitPrediction = async (isYes: boolean, amount: string) => {
    try {
      if (!fhevmInstance) {
        throw new Error('fhEVM instance not initialized, please try again later');
      }

      if (!address) {
        throw new Error('Please connect wallet first');
      }

      const amountWei = parseEther(amount);

      if (!marketAddress) {
        throw new Error('Market address not provided');
      }

      // Use fhEVM to encrypt prediction and amount
      const input = fhevmInstance.createEncryptedInput(
        marketAddress,
        address
      );

      // Encrypt prediction (0 = NO, 1 = YES) as euint8
      input.add8(isYes ? 1 : 0);

      // Encrypt amount as euint64 (amountWei is already bigint type)
      input.add64(amountWei);

      const encryptedInputs = await input.encrypt();

      // Validate encryption result
      if (!encryptedInputs.handles || encryptedInputs.handles.length < 2) {
        throw new Error('Encryption failed: insufficient handles');
      }

      if (!encryptedInputs.inputProof || encryptedInputs.inputProof.length === 0) {
        throw new Error('Encryption failed: empty inputProof');
      }

      // Convert Uint8Array to hex string (required by wagmi)
      const handle0Hex = uint8ArrayToHex(encryptedInputs.handles[0]);
      const handle1Hex = uint8ArrayToHex(encryptedInputs.handles[1]);
      const proofHex = uint8ArrayToHex(encryptedInputs.inputProof);

      // Call contract, passing encrypted handles and proof
      writeContract({
        address: marketAddress,
        abi: BlindOracleABI.abi,
        functionName: 'commitPrediction',
        args: [
          handle0Hex,  // encryptedPrediction (bytes32)
          handle1Hex,  // encryptedAmount (bytes32)
          proofHex,    // predictionProof (bytes)
          proofHex,    // amountProof (bytes) - use the same proof
        ],
        value: amountWei,
      });
    } catch (err) {
      throw err;
    }
  };

  // Buy YES tokens
  const buyYesTokens = async (amount: string) => {
    if (!marketAddress) return;
    const amountWei = parseEther(amount);
    writeContract({
      address: marketAddress,
      abi: BlindOracleABI.abi as any,
      functionName: 'buyYesTokens',
      value: amountWei,
    });
  };

  // Buy NO tokens
  const buyNoTokens = async (amount: string) => {
    if (!marketAddress) return;
    const amountWei = parseEther(amount);
    writeContract({
      address: marketAddress,
      abi: BlindOracleABI.abi as any,
      functionName: 'buyNoTokens',
      value: amountWei,
    });
  };

  // Sell YES tokens
  const sellYesTokens = async (amount: string) => {
    if (!marketAddress) return;
    const amountWei = parseEther(amount);
    writeContract({
      address: marketAddress,
      abi: BlindOracleABI.abi as any,
      functionName: 'sellYesTokens',
      args: [amountWei],
    });
  };

  // Sell NO tokens
  const sellNoTokens = async (amount: string) => {
    if (!marketAddress) return;
    const amountWei = parseEther(amount);
    writeContract({
      address: marketAddress,
      abi: BlindOracleABI.abi as any,
      functionName: 'sellNoTokens',
      args: [amountWei],
    });
  };

  // Aggregate bets
  const aggregateBets = async () => {
    if (!marketAddress) {
      throw new Error('Market address not provided');
    }

    writeContract({
      address: marketAddress,
      abi: BlindOracleABI.abi,
      functionName: 'aggregateBets',
    });
  };

  // Request decryption
  const requestAggregateDecryption = () => {
    if (!marketAddress) {
      throw new Error('Market address not provided');
    }

    return writeContract({
      address: marketAddress,
      abi: BlindOracleABI.abi,
      functionName: 'requestAggregateDecryption',
    });
  };

  // Settle market
  const settleMarket = async (outcome: boolean) => {
    if (!marketAddress) {
      throw new Error('Market address not provided');
    }

    writeContract({
      address: marketAddress,
      abi: BlindOracleABI.abi,
      functionName: 'settleMarket',
      args: [outcome],
    });
  };

  // Claim rewards
  const claimRewards = async () => {
    if (!marketAddress) {
      throw new Error('Market address not provided');
    }

    writeContract({
      address: marketAddress,
      abi: BlindOracleABI.abi,
      functionName: 'claimRewards',
    });
  };

  // Event market settlement related functions

  // Deposit owner stake
  const depositOwnerStake = async (stakeAmount: string) => {
    if (!marketAddress) {
      throw new Error('Market address not provided');
    }

    writeContract({
      address: marketAddress,
      abi: BlindOracleABI.abi,
      functionName: 'depositOwnerStake',
      value: parseEther(stakeAmount),
    });
  };

  // Propose settlement
  const proposeSettlement = async (outcome: boolean) => {
    if (!marketAddress) {
      throw new Error('Market address not provided');
    }

    writeContract({
      address: marketAddress,
      abi: BlindOracleABI.abi,
      functionName: 'proposeSettlement',
      args: [outcome],
    });
  };

  // Challenge settlement
  const challengeSettlement = async () => {
    if (!marketAddress) {
      throw new Error('Market address not provided');
    }

    writeContract({
      address: marketAddress,
      abi: BlindOracleABI.abi,
      functionName: 'challengeSettlement',
    });
  };

  // Finalize settlement
  const finalizeSettlement = async () => {
    if (!marketAddress) {
      throw new Error('Market address not provided');
    }

    writeContract({
      address: marketAddress,
      abi: BlindOracleABI.abi,
      functionName: 'finalizeSettlement',
    });
  };

  // Price market settlement

  // Auto-settle price market
  const settlePriceMarket = async () => {
    if (!marketAddress) {
      throw new Error('Market address not provided');
    }

    writeContract({
      address: marketAddress,
      abi: BlindOracleABI.abi,
      functionName: 'settlePriceMarket',
    });
  };

  return {
    // State
    currentPhase: currentPhase as number | undefined,
    eventDescription: eventDescription as string | undefined,
    totalPool: totalPool as bigint | undefined,
    participantCount: participantCount as bigint | undefined,
    commitmentDeadline: commitmentDeadline as bigint | undefined,
    eventDeadline: eventDeadline as bigint | undefined,
    totalYesAmount: totalYesAmount as bigint | undefined,
    totalNoAmount: totalNoAmount as bigint | undefined,
    isSettled: isSettled as boolean | undefined,
    finalOutcome: finalOutcome as boolean | undefined,
    isAggregated: isAggregated as boolean | undefined,
    hasCommitted: hasCommitted as boolean | undefined,
    hasClaimed: hasClaimed as boolean | undefined,

    // Market type and settlement info
    marketType: marketType as number | undefined, // 0 = Event, 1 = Price
    priceMarketInfo: priceMarketInfo as any,
    settlementInfo: settlementInfo as any,

    // Transaction state
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,

    // Refresh functions
    refetchData: () => {
      refetchCurrentPhase();
      refetchEventDescription();
      refetchTotalPool();
      refetchParticipantCount();
      refetchMarketInfo();
      refetchIsAggregated();
      refetchMarketType();
      refetchPriceMarketInfo();
      refetchSettlementInfo();
    },

    // Operations
    submitPrediction,
    aggregateBets,
    requestAggregateDecryption,
    settleMarket,
    claimRewards,
    buyYesTokens,
    buyNoTokens,
    sellYesTokens,
    sellNoTokens,

    // Event market settlement operations
    depositOwnerStake,
    proposeSettlement,
    challengeSettlement,
    finalizeSettlement,

    // Price market settlement operations
    settlePriceMarket,
  };
}

