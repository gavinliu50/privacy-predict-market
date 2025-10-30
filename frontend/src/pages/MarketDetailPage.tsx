import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWalletClient } from 'wagmi';
import { formatEther } from 'viem';
import { useBlindOracle } from '../hooks/useBlindOracle';
import { useChainlinkPrice, Asset } from '../hooks/useChainlinkPrice';
import { useRealtimePrice, PriceAsset } from '../hooks/useRealtimePrice';
import { Toast } from '../components/Toast';
import type { ToastType } from '../components/Toast';
import { Countdown } from '../components/Countdown';
import { decryptBatch } from '../lib/fheDecrypt';
import { BrowserProvider } from 'ethers';

// Phase enum matching the simplified contract
const Phase = {
  BlindCommitment: 0,
  Aggregating: 1,
  AwaitingDecryption: 2,
  Settled: 3,
} as const;

type Phase = typeof Phase[keyof typeof Phase];

export default function MarketDetailPage() {
  const { marketAddress } = useParams<{ marketAddress: string }>();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const {
    currentPhase: contractPhase,
    eventDescription,
    totalPool,
    participantCount,
    commitmentDeadline,
    eventDeadline,
    totalYesAmount,
    totalNoAmount,
    isSettled,
    finalOutcome,
    isAggregated,
    hasCommitted,
    hasClaimed,
    marketType,
    priceMarketInfo,
    settlementInfo,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
    submitPrediction,
    aggregateBets,
    requestAggregateDecryption,
    settleMarket,
    claimRewards,
    depositOwnerStake,
    proposeSettlement,
    challengeSettlement,
    finalizeSettlement,
    settlePriceMarket,
    refetchData,
  } = useBlindOracle(marketAddress as `0x${string}`);

  const [prediction, setPrediction] = useState<'YES' | 'NO'>('YES');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastConfirmedHash, setLastConfirmedHash] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Decryption state
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedPrediction, setDecryptedPrediction] = useState<number | null>(null);
  const [decryptedAmount, setDecryptedAmount] = useState<bigint | null>(null);
  const [showDecrypted, setShowDecrypted] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const phaseNames = ['🔒 Blind Commitment', '⚙️ Aggregating', '⏳ Awaiting Decryption', '🏆 Settled'];

  // Use contract's actual phase
  const currentPhase = (contractPhase !== undefined ? contractPhase : Phase.BlindCommitment) as Phase;

  // Get Chainlink price (for settlement, backend use)
  // priceMarketInfo structure: [marketType, priceOracle, targetAsset, targetPrice]
  const targetAsset = priceMarketInfo ? (priceMarketInfo as any)[2] : undefined;
  const oracleAddress = priceMarketInfo ? (priceMarketInfo as any)[1] : undefined; // Index 1 is priceOracle

  const {
    price: chainlinkPrice,
    isLoading: isChainlinkLoading,
  } = useChainlinkPrice(
    marketType === 1 && oracleAddress ? oracleAddress : undefined,
    targetAsset !== undefined ? targetAsset : Asset.ETH
  );

  // Get realtime price (for display)
  const assetMap: { [key: number]: PriceAsset } = {
    0: PriceAsset.ETH,
    1: PriceAsset.BTC,
    2: PriceAsset.SOL,
  };
  const {
    price: realtimePrice,
    timestamp: realtimeTimestamp,
    isLoading: isRealtimeLoading,
  } = useRealtimePrice(
    marketType === 1 && targetAsset !== undefined ? assetMap[targetAsset] : PriceAsset.ETH
  );

  // Price change animation state
  const [priceChangeDirection, setPriceChangeDirection] = useState<'up' | 'down' | null>(null);
  const [previousPrice, setPreviousPrice] = useState<number | undefined>(undefined);
  const [displayPrice, setDisplayPrice] = useState<number | undefined>(undefined);
  const [isAnimating, setIsAnimating] = useState(false);

  // Listen to price changes, trigger scroll animation
  useEffect(() => {
    if (realtimePrice !== undefined) {
      // First load, display directly
      if (previousPrice === undefined) {
        setDisplayPrice(realtimePrice);
        setPreviousPrice(realtimePrice);
        return;
      }

      // Trigger animation when price changes
      if (realtimePrice !== previousPrice) {
        setPriceChangeDirection(realtimePrice > previousPrice ? 'up' : 'down');
        setIsAnimating(true);

        // Update display price after 500ms (sync with animation duration)
        const timer = setTimeout(() => {
          setDisplayPrice(realtimePrice);
          setPreviousPrice(realtimePrice);
          setIsAnimating(false);

          // Clear color state after another 500ms
          setTimeout(() => {
            setPriceChangeDirection(null);
          }, 500);
        }, 500);

        return () => clearTimeout(timer);
      }
    }
  }, [realtimePrice, previousPrice]);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  // Handle prediction submission
  const handleSubmitPrediction = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      setPendingAction('submitPrediction');
      await submitPrediction(prediction === 'YES', amount);
    } catch (err) {
      console.error('Submission failed:', err);
      showToast('Submission failed: ' + (err as Error).message, 'error');
      setPendingAction(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle decrypt my prediction
  const handleDecryptMyPrediction = async () => {
    if (!isConnected || !address || !walletClient) {
      showToast('Please connect your wallet first', 'error');
      return;
    }

    if (!hasCommitted) {
      showToast('You have not submitted a prediction yet', 'error');
      return;
    }

    try {
      setIsDecrypting(true);
      showToast('🔓 Requesting decryption... Please sign the message', 'info');

      // Create ethers signer
      const provider = new BrowserProvider(walletClient as any);
      const signer = await provider.getSigner();

      // Use viem's publicClient to call contract
      const { createPublicClient, http } = await import('viem');
      const { sepolia } = await import('viem/chains');

      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(),
      });

      // Import ABI
      const BlindOracleABI = (await import('../BlindOracleABI.json')).default;

      // Call getMyCommitment
      const commitment = await publicClient.readContract({
        address: marketAddress as `0x${string}`,
        abi: BlindOracleABI.abi,
        functionName: 'getMyCommitment',
        account: address,
      }) as [string, string]; // [predictionHandle, amountHandle]

      const predictionHandle = commitment[0];
      const amountHandle = commitment[1];

      // Batch decrypt (only need to sign once)
      const decrypted = await decryptBatch(
        [predictionHandle, amountHandle],
        marketAddress!,
        address,
        signer
      );

      const pred = Number(decrypted[predictionHandle]);
      const amt = BigInt(decrypted[amountHandle]);

      setDecryptedPrediction(pred);
      setDecryptedAmount(amt);
      setShowDecrypted(true);

      showToast('✅ Decryption successful!', 'success');
    } catch (err) {
      console.error('Decryption failed:', err);
      showToast('Decryption failed: ' + (err as Error).message, 'error');
    } finally {
      setIsDecrypting(false);
    }
  };

  // Listen for transaction confirmation
  useEffect(() => {
    if (isConfirmed && hash && hash !== lastConfirmedHash) {
      // Show appropriate success message based on pending action
      const successMessages: Record<string, string> = {
        'submitPrediction': '🎉 Prediction submitted successfully!',
        'aggregateBets': '✅ Aggregation completed successfully!',
        'requestDecryption': '🔓 Decryption request submitted successfully!',
        'settleMarket': '🏆 Market settled successfully!',
        'claimRewards': '💰 Rewards claimed successfully!',
      };

      const message = pendingAction && successMessages[pendingAction]
        ? successMessages[pendingAction]
        : '✅ Transaction confirmed!';

      showToast(message, 'success');
      setAmount('');
      setLastConfirmedHash(hash);
      setPendingAction(null);

      // Refresh data immediately
      refetchData();

      // Refresh again after delay (ensure on-chain state is updated)
      setTimeout(() => {
        refetchData();
      }, 2000);
    }
  }, [isConfirmed, hash, lastConfirmedHash, refetchData, pendingAction]);

  // Display errors
  useEffect(() => {
    if (error) {
      showToast('Transaction failed: ' + error.message, 'error');
      setPendingAction(null);
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="text-gray-400 hover:text-white transition-colors">
                ← Back
              </Link>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                The Blind Oracle
              </h1>
            </div>
            <ConnectButton />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Market Info Card */}
        <div className="bg-gray-800 rounded-lg p-8 mb-8 border border-gray-700">
          {/* Market Type Badge */}
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-2xl font-bold text-white">
              {eventDescription || 'Loading...'}
            </h2>
            {marketType !== undefined && (
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                marketType === 0
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                  : 'bg-green-500/20 text-green-400 border border-green-500/50'
              }`}>
                {marketType === 0 ? '📝 Event Market' : '💰 Price Market'}
              </span>
            )}
          </div>

          {/* Risk Warning for Event Markets */}
          {marketType === 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="text-yellow-400 font-semibold mb-1">Event Market Risk Notice</p>
                  <p className="text-yellow-300/80 text-sm">
                    This market will be manually settled by the creator. The creator cannot participate in this market
                    and must deposit a 10% stake. After settlement is proposed, there is a 24-hour challenge period
                    where participants can dispute the outcome.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Price Market Info */}
          {marketType === 1 && priceMarketInfo && (
            <div className="bg-gradient-to-br from-green-500/10 to-blue-500/10 border border-green-500/30 rounded-xl p-5 mb-6 shadow-lg">
              <div className="flex items-start gap-3">
                <span className="text-3xl">💰</span>
                <div className="flex-1">
                  <p className="text-green-400 font-semibold mb-3 text-lg">Price Oracle Market</p>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {/* Target Asset */}
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <span className="text-gray-400 text-xs block mb-1">Target Asset</span>
                      <span className="text-white text-lg font-bold">
                        {priceMarketInfo[2] === 0 ? '🔷 ETH' : priceMarketInfo[2] === 1 ? '🟠 BTC' : '🟣 SOL'}
                      </span>
                    </div>

                    {/* Target Price */}
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <span className="text-gray-400 text-xs block mb-1">Target Price</span>
                      <span className="text-white text-lg font-bold">
                        ${(Number(priceMarketInfo[3]) / 1e8).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* 实时价格显示（带滚动动画） */}
                  <div className={`bg-gradient-to-r from-gray-800/70 to-gray-800/50 rounded-xl p-5 mb-3 border transition-all duration-300 ${
                    priceChangeDirection === 'up'
                      ? 'border-green-500/50 shadow-lg shadow-green-500/20'
                      : priceChangeDirection === 'down'
                      ? 'border-red-500/50 shadow-lg shadow-red-500/20'
                      : 'border-gray-700/50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-300 text-sm font-medium">Current Price</span>
                        <div className="flex items-center gap-1">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                          </span>
                          <span className="text-xs text-green-400 font-semibold">LIVE</span>
                        </div>
                      </div>

                      {isRealtimeLoading ? (
                        <div className="flex items-center gap-2">
                          <div className="animate-pulse bg-gray-700 h-10 w-40 rounded-lg"></div>
                        </div>
                      ) : displayPrice !== undefined ? (
                        <div className="text-right min-w-[200px]">
                          {/* 价格滚动窗口容器 - 固定高度和宽度 */}
                          <div className="relative h-12 overflow-hidden flex items-center justify-end">
                            {/* 旧价格（向上滚出） - 只在动画时显示 */}
                            {isAnimating && previousPrice !== undefined && (
                              <div className="absolute right-0 top-0 h-full flex items-center animate-price-slide-out">
                                <span className={`text-4xl font-bold whitespace-nowrap ${
                                  priceChangeDirection === 'up' ? 'text-green-400' : 'text-red-400'
                                }`}>
                                  ${previousPrice.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })}
                                </span>
                              </div>
                            )}

                            {/* 新价格（从下方滚入或静态显示） */}
                            <div className={`${isAnimating ? 'absolute right-0 top-0' : 'relative'} h-full flex items-center ${
                              isAnimating ? 'animate-price-slide-up' : ''
                            }`}>
                              <span className={`text-4xl font-bold whitespace-nowrap transition-colors duration-500 ${
                                priceChangeDirection === 'up'
                                  ? 'text-green-400'
                                  : priceChangeDirection === 'down'
                                  ? 'text-red-400'
                                  : 'text-white'
                              }`}>
                                ${displayPrice.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500 text-sm">N/A</span>
                      )}
                    </div>

                    {/* 更新时间和数据源 */}
                    <div className="mt-3 pt-3 border-t border-gray-700/50 flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        Source: <span className="text-gray-400 font-medium">Binance</span>
                      </span>
                      {realtimeTimestamp && (
                        <span className="text-xs text-gray-500">
                          Updated: <span className="text-gray-400">{realtimeTimestamp.toLocaleTimeString()}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 说明文字 */}
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <p className="text-blue-300 text-xs leading-relaxed">
                      <span className="font-semibold">🤖 Automatic Settlement:</span> This market will be settled automatically using Chainlink price oracle at the deadline. The settlement price is fetched from the blockchain, ensuring transparency and fairness.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-gray-700/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-1">Total Pool</p>
              <p className="text-2xl font-bold text-white">
                {totalPool ? formatEther(totalPool as bigint) : '0'} ETH
              </p>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-1">Participants</p>
              <p className="text-2xl font-bold text-white">{participantCount?.toString() || '0'}</p>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-1">Current Phase</p>
              <p className="text-xl font-bold text-blue-400">{phaseNames[currentPhase]}</p>
            </div>
            {commitmentDeadline && currentPhase === Phase.BlindCommitment && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <Countdown deadline={commitmentDeadline} label="Commitment Ends In" />
              </div>
            )}
            {eventDeadline && currentPhase !== Phase.BlindCommitment && currentPhase !== Phase.Settled && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <Countdown deadline={eventDeadline} label="Event Deadline" />
              </div>
            )}
          </div>

          {/* Market Address */}
          <div className="text-xs text-gray-500">
            Market: {marketAddress}
          </div>
        </div>

        {/* Prediction Form */}
        {currentPhase === Phase.BlindCommitment && (
          <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
            {/* Check if commitment deadline has passed */}
            {commitmentDeadline && Date.now() >= Number(commitmentDeadline) * 1000 ? (
              <>
                {/* No Participants Warning */}
                {participantCount !== undefined && Number(participantCount) === 0 ? (
                  <div className="bg-gray-700/50 rounded-lg p-8 text-center">
                    <span className="text-6xl mb-4 block">😴</span>
                    <h3 className="text-xl font-bold text-gray-400 mb-3">No Participants</h3>
                    <p className="text-gray-500 text-sm">
                      This market has no participants. It cannot be aggregated or settled.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Warning: Event Deadline Passed but not aggregated */}
                    {eventDeadline && Date.now() >= Number(eventDeadline) * 1000 && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
                        <div className="flex items-start gap-3">
                          <span className="text-2xl">⚠️</span>
                          <div>
                            <h4 className="text-lg font-bold text-red-400 mb-2">Event Deadline Passed!</h4>
                            <p className="text-gray-300 text-sm mb-2">
                              The event deadline has passed, but aggregation hasn't been triggered yet.
                            </p>
                            <p className="text-yellow-400 text-sm font-semibold">
                              ⚡ Please click "Start Aggregation" below to proceed with settlement!
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <h3 className="text-xl font-bold text-white mb-6">⏰ Commitment Phase Ended</h3>

                {/* Participation Status */}
                {!hasCommitted && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
                    <div className="flex items-start gap-3">
                      <span className="text-xl">ℹ️</span>
                      <div>
                        <p className="text-blue-400 text-sm font-semibold mb-1">You didn't participate in this market</p>
                        <p className="text-gray-300 text-xs">
                          However, you can still help push the market forward by triggering the next phase.
                          This is a <span className="font-semibold text-green-400">decentralized design</span> - anyone can trigger phase transitions to prevent the market from getting stuck.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Price Market: Semi-Auto Notice */}
                {marketType === 1 ? (
                  <>
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 mb-6">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">🤖</span>
                        <div>
                          <h4 className="text-lg font-bold text-green-400 mb-2">Price Market - Automated Settlement</h4>
                          <p className="text-gray-300 text-sm mb-3">
                            This is a <span className="font-semibold text-green-400">Price Market</span>.
                            The final settlement will be <span className="font-semibold text-green-400">automatically determined</span> by Chainlink price oracle.
                          </p>
                          <p className="text-gray-300 text-sm mb-3">
                            However, someone needs to trigger the aggregation process to move to the next phase:
                          </p>
                          <ul className="text-gray-300 text-sm space-y-2 ml-4">
                            <li className="flex items-start gap-2">
                              <span className="text-yellow-400 mt-0.5">→</span>
                              <span>Click the button below to start aggregation (anyone can do this)</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-gray-500 mt-0.5">○</span>
                              <span className="text-gray-400">Decryption will be requested next</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-green-400 mt-0.5">✓</span>
                              <span>Settlement will use Chainlink oracle (automatic)</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          setPendingAction('aggregateBets');
                          await aggregateBets();
                        } catch (err) {
                          showToast('Failed to aggregate: ' + (err as Error).message, 'error');
                          setPendingAction(null);
                        }
                      }}
                      disabled={isPending || isConfirming}
                      className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                    >
                      {isPending || isConfirming ? '⏳ Starting Aggregation...' : '⚙️ Start Aggregation'}
                    </button>
                  </>
                ) : (
                  /* Event Market: Manual Aggregation Required */
                  <>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6 mb-6">
                      <p className="text-yellow-400 mb-4">
                        The commitment deadline has passed. The market needs to transition to the aggregation phase.
                      </p>
                      <p className="text-gray-300 text-sm">
                        Anyone can trigger the aggregation process by clicking the button below.
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          setPendingAction('aggregateBets');
                          await aggregateBets();
                        } catch (err) {
                          showToast('Failed to aggregate: ' + (err as Error).message, 'error');
                          setPendingAction(null);
                        }
                      }}
                      disabled={isPending || isConfirming}
                      className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                    >
                      {isPending || isConfirming ? '⏳ Starting Aggregation...' : '⚙️ Start Aggregation'}
                    </button>
                  </>
                )}
                  </>
                )}
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-white mb-6">Submit Your Prediction</h3>

                {/* Show if user has already committed */}
                {hasCommitted ? (
                  <div className="space-y-4">
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
                      <p className="text-green-400 font-semibold mb-2">✅ You have already submitted your prediction!</p>
                      <p className="text-gray-300 text-sm">
                        Your prediction is encrypted and stored securely. You can view it by clicking the button below.
                      </p>
                    </div>

                    {/* View My Prediction Button */}
                    <button
                      onClick={handleDecryptMyPrediction}
                      disabled={isDecrypting}
                      className="w-full py-4 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                    >
                      {isDecrypting ? '🔓 Decrypting...' : '🔍 View My Prediction (Requires Signature)'}
                    </button>

                    {/* Show decrypted data */}
                    {showDecrypted && decryptedPrediction !== null && decryptedAmount !== null && (
                      <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6 space-y-3">
                        <h4 className="text-lg font-bold text-white mb-3">🔓 Your Decrypted Prediction:</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-gray-800 rounded-lg p-4">
                            <p className="text-gray-400 text-sm mb-1">Prediction</p>
                            <p className={`text-2xl font-bold ${decryptedPrediction === 1 ? 'text-green-400' : 'text-red-400'}`}>
                              {decryptedPrediction === 1 ? '✅ YES' : '❌ NO'}
                            </p>
                          </div>
                          <div className="bg-gray-800 rounded-lg p-4">
                            <p className="text-gray-400 text-sm mb-1">Amount</p>
                            <p className="text-2xl font-bold text-blue-400">
                              {formatEther(decryptedAmount)} ETH
                            </p>
                          </div>
                        </div>
                        <p className="text-gray-400 text-xs mt-2">
                          💡 This data was decrypted using Zama's FHE technology with your EIP-712 signature.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Prediction Selection */}
                    <div className="mb-6">
                      <label className="block text-gray-300 font-semibold mb-3">Your Prediction</label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setPrediction('YES')}
                          className={`py-4 px-6 rounded-lg font-bold text-lg transition-all ${
                            prediction === 'YES'
                              ? 'bg-green-500 text-white shadow-lg shadow-green-500/50'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          ✅ YES
                        </button>
                        <button
                          onClick={() => setPrediction('NO')}
                          className={`py-4 px-6 rounded-lg font-bold text-lg transition-all ${
                            prediction === 'NO'
                              ? 'bg-red-500 text-white shadow-lg shadow-red-500/50'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          ❌ NO
                        </button>
                      </div>
                    </div>

                    {/* Amount Input */}
                    <div className="mb-6">
                      <label className="block text-gray-300 font-semibold mb-3">Bet Amount (ETH)</label>
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.01"
                        step="0.01"
                        min="0"
                        className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none text-lg"
                      />
                    </div>

                    {/* Privacy Notice */}
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
                      <p className="text-blue-400 text-sm">
                        🔒 <strong>Privacy Protected:</strong> Your prediction and amount are encrypted using FHE.
                        No one can see your choice until the commitment phase ends.
                      </p>
                    </div>

                    {/* Submit Button */}
                    <button
                      onClick={handleSubmitPrediction}
                      disabled={!isConnected || isSubmitting || isPending || isConfirming || hasCommitted}
                      className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors text-lg"
                    >
                  {!isConnected
                    ? '🔌 Connect Wallet First'
                    : hasCommitted
                    ? '✅ Already Submitted'
                    : isSubmitting || isPending
                    ? '⏳ Submitting...'
                    : isConfirming
                    ? '⏳ Confirming...'
                    : '🚀 Submit Prediction'}
                </button>
                  </>
                )}

                {/* Status Messages */}
                {isPending && (
                  <p className="text-yellow-400 text-center mt-4 text-sm">
                    Please confirm the transaction in your wallet...
                  </p>
                )}
                {isConfirming && (
                  <p className="text-blue-400 text-center mt-4 text-sm">
                    Transaction submitted! Waiting for confirmation...
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Phase 2: Aggregating */}
        {currentPhase === Phase.Aggregating && (
          <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
            {/* Warning: Event Deadline Passed but not decrypted */}
            {eventDeadline && Date.now() >= Number(eventDeadline) * 1000 && isAggregated && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <h4 className="text-lg font-bold text-red-400 mb-2">Event Deadline Passed!</h4>
                    <p className="text-gray-300 text-sm mb-2">
                      The event deadline has passed, but decryption hasn't been requested yet.
                    </p>
                    <p className="text-yellow-400 text-sm font-semibold">
                      ⚡ Please click "Request Decryption" below to proceed with settlement!
                    </p>
                  </div>
                </div>
              </div>
            )}

            <h3 className="text-xl font-bold text-white mb-6">⚙️ Aggregating Phase</h3>

            {/* Participation Status */}
            {!hasCommitted && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <span className="text-xl">ℹ️</span>
                  <div>
                    <p className="text-blue-400 text-sm font-semibold mb-1">You didn't participate in this market</p>
                    <p className="text-gray-300 text-xs">
                      However, you can still help push the market forward by triggering the next phase.
                      This is a <span className="font-semibold text-green-400">decentralized design</span> - anyone can trigger phase transitions to prevent the market from getting stuck.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Price Market: Semi-Auto Processing */}
            {marketType === 1 ? (
              <>
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 mb-6">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">🤖</span>
                    <div>
                      <h4 className="text-lg font-bold text-green-400 mb-2">Price Market - Processing</h4>
                      <p className="text-gray-300 text-sm mb-3">
                        Encrypted predictions are being aggregated using homomorphic encryption.
                      </p>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className={isAggregated ? 'text-green-400' : 'text-yellow-400'}>
                            {isAggregated ? '✓' : '⏳'}
                          </span>
                          <span className="text-gray-300">
                            Aggregation {isAggregated ? 'Complete' : 'In Progress'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">○</span>
                          <span className="text-gray-400">Decryption (Next)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-green-400">✓</span>
                          <span className="text-gray-300">Settlement will use Chainlink oracle (automatic)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {isAggregated && (
                  <button
                    onClick={() => {
                      try {
                        setPendingAction('requestDecryption');
                        requestAggregateDecryption();
                      } catch (err) {
                        showToast('Failed to request decryption: ' + (err as Error).message, 'error');
                        setPendingAction(null);
                      }
                    }}
                    disabled={isPending || isConfirming}
                    className="w-full py-4 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                  >
                    {isPending || isConfirming ? '⏳ Requesting...' : '🔓 Request Decryption'}
                  </button>
                )}

                {!isAggregated && (
                  <button
                    onClick={async () => {
                      try {
                        setPendingAction('aggregateBets');
                        await aggregateBets();
                      } catch (err) {
                        showToast('Failed to aggregate: ' + (err as Error).message, 'error');
                        setPendingAction(null);
                      }
                    }}
                    disabled={isPending || isConfirming}
                    className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                  >
                    {isPending || isConfirming ? '⏳ Aggregating...' : '⚙️ Start Aggregation'}
                  </button>
                )}
              </>
            ) : (
              /* Event Market: Manual Controls */
              <>
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-6 mb-6">
                  <p className="text-blue-400 mb-4">
                    The commitment phase has ended. Encrypted predictions are being aggregated using homomorphic encryption.
                  </p>
                  <p className="text-gray-300 text-sm">
                    Status: {isAggregated ? '✅ Aggregation complete' : '⏳ Waiting for aggregation...'}
                  </p>
                </div>

                {isAggregated && (
                  <button
                    onClick={() => {
                      try {
                        setPendingAction('requestDecryption');
                        requestAggregateDecryption();
                      } catch (err) {
                        showToast('Failed to request decryption: ' + (err as Error).message, 'error');
                        setPendingAction(null);
                      }
                    }}
                    disabled={isPending || isConfirming}
                    className="w-full py-4 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                  >
                    {isPending || isConfirming ? '⏳ Requesting...' : '🔓 Request Decryption'}
                  </button>
                )}

                {!isAggregated && (
                  <button
                    onClick={async () => {
                      try {
                        setPendingAction('aggregateBets');
                        await aggregateBets();
                      } catch (err) {
                        showToast('Failed to aggregate: ' + (err as Error).message, 'error');
                        setPendingAction(null);
                      }
                    }}
                    disabled={isPending || isConfirming}
                    className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                  >
                    {isPending || isConfirming ? '⏳ Aggregating...' : '⚙️ Start Aggregation'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Phase 3: Awaiting Decryption */}
        {currentPhase === Phase.AwaitingDecryption && (
          <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-6">⏳ Awaiting Decryption</h3>

            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-6 mb-6">
              <p className="text-purple-400 mb-4">
                Decryption request has been submitted to the Gateway. Waiting for the oracle to decrypt the aggregated results...
              </p>
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
              </div>
            </div>

            {totalYesAmount !== undefined && totalNoAmount !== undefined && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <p className="text-green-400 text-sm mb-1">Total YES</p>
                  <p className="text-2xl font-bold text-white">
                    {formatEther(totalYesAmount as bigint)} ETH
                  </p>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <p className="text-red-400 text-sm mb-1">Total NO</p>
                  <p className="text-2xl font-bold text-white">
                    {formatEther(totalNoAmount as bigint)} ETH
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Phase 4: Settled */}
        {currentPhase === Phase.Settled && (
          <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-6">🏆 Market Settled</h3>

            {/* Results */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <p className="text-green-400 text-sm mb-1">Total YES</p>
                <p className="text-2xl font-bold text-white">
                  {totalYesAmount ? formatEther(totalYesAmount as bigint) : '0'} ETH
                </p>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <p className="text-red-400 text-sm mb-1">Total NO</p>
                <p className="text-2xl font-bold text-white">
                  {totalNoAmount ? formatEther(totalNoAmount as bigint) : '0'} ETH
                </p>
              </div>
            </div>

            {/* Price Market Settled - Show Final Result */}
            {marketType === 1 && isSettled && priceMarketInfo && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 mb-6">
                <h4 className="text-lg font-bold text-green-400 mb-3">🤖 Automatic Price Settlement</h4>
                <p className="text-gray-300 text-sm mb-4">
                  This market was automatically settled using Chainlink price oracle at the event deadline.
                </p>
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                    <div>
                      <span className="text-gray-400">Target Asset:</span>
                      <span className="text-white ml-2 font-semibold">
                        {priceMarketInfo[2] === 0 ? '🔷 ETH' : priceMarketInfo[2] === 1 ? '🟠 BTC' : '🟣 SOL'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Target Price:</span>
                      <span className="text-white ml-2 font-semibold">
                        ${(Number(priceMarketInfo[3]) / 1e8).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* 结算价格（固定值） */}
                  <div className="pt-3 border-t border-gray-600">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">Settlement Price:</span>
                      {isChainlinkLoading ? (
                        <span className="text-gray-500 text-xs">Loading...</span>
                      ) : chainlinkPrice !== undefined ? (
                        <span className="text-green-400 font-bold text-2xl">
                          ${chainlinkPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-gray-500 text-xs">N/A</span>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs mt-2 text-right">
                      {eventDeadline && new Date(Number(eventDeadline) * 1000).toLocaleString()}
                    </p>
                  </div>

                  {/* 结果 */}
                  <div className="mt-4 pt-4 border-t border-gray-600">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-gray-400">Result:</span>
                      <span className={`font-bold text-lg ${finalOutcome ? 'text-green-400' : 'text-red-400'}`}>
                        {finalOutcome ? '✅ YES Won' : '❌ NO Won'}
                      </span>
                      <span className="text-gray-500 text-sm">
                        ({finalOutcome ? 'Price ≥ Target' : 'Price < Target'})
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Price Market Auto Settlement */}
            {marketType === 1 && !isSettled && priceMarketInfo && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 mb-6">
                <h4 className="text-lg font-bold text-green-400 mb-3">🤖 Automatic Price Settlement</h4>
                <p className="text-gray-300 text-sm mb-4">
                  This market will be automatically settled using Chainlink price oracle.
                  <span className="block mt-2 text-blue-300">
                    ℹ️ <strong>Why manual trigger?</strong> Smart contracts cannot execute themselves on the blockchain.
                    Anyone can trigger the settlement after the deadline - the result is determined by Chainlink, not the person who triggers it.
                  </span>
                </p>
                <div className="bg-gray-700/50 rounded-lg p-4 mb-4">
                  <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                    <div>
                      <span className="text-gray-400">Target Asset:</span>
                      <span className="text-white ml-2 font-semibold">
                        {priceMarketInfo[2] === 0 ? '🔷 ETH' : priceMarketInfo[2] === 1 ? '🟠 BTC' : '🟣 SOL'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Target Price:</span>
                      <span className="text-white ml-2 font-semibold">
                        ${(Number(priceMarketInfo[3]) / 1e8).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* 实时价格 */}
                  <div className="pt-3 border-t border-gray-600 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">Market Price:</span>
                      {isRealtimeLoading ? (
                        <span className="text-gray-500 text-xs">Loading...</span>
                      ) : realtimePrice !== undefined ? (
                        <span className="text-green-400 font-bold text-base">
                          ${realtimePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-gray-500 text-xs">N/A</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">Settlement Price:</span>
                      {isChainlinkLoading ? (
                        <span className="text-gray-500 text-xs">Loading...</span>
                      ) : chainlinkPrice !== undefined ? (
                        <span className="text-blue-400 font-bold text-base">
                          ${chainlinkPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-gray-500 text-xs">N/A</span>
                      )}
                    </div>
                  </div>
                </div>
                {eventDeadline && Date.now() >= Number(eventDeadline) * 1000 && (
                  <div>
                    <button
                      onClick={async () => {
                        try {
                          setPendingAction('settlePriceMarket');
                          await settlePriceMarket();
                        } catch (err) {
                          showToast('Failed to settle: ' + (err as Error).message, 'error');
                          setPendingAction(null);
                        }
                      }}
                      disabled={isPending || isConfirming}
                      className="w-full py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                    >
                      {isPending || isConfirming ? '⏳ Settling...' : '🎯 Settle Market (Fetch Chainlink Price)'}
                    </button>
                    <p className="text-xs text-gray-400 mt-2 text-center">
                      Click to fetch the current price from Chainlink and determine the winner
                    </p>
                  </div>
                )}
                {eventDeadline && Date.now() < Number(eventDeadline) * 1000 && (
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <p className="text-gray-400 text-sm mb-2">Settlement Available In:</p>
                    <Countdown deadline={eventDeadline} label="" />
                  </div>
                )}
              </div>
            )}

            {/* Event Market Settlement Process */}
            {marketType === 0 && !isSettled && settlementInfo && (
              <div className="mb-6 space-y-4">
                {/* Step 1: Deposit Stake */}
                {settlementInfo[4] === 0n && ( // ownerStake === 0
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-6">
                    <h4 className="text-lg font-bold text-purple-400 mb-3">Step 1: Owner Must Deposit Stake</h4>
                    <p className="text-gray-300 text-sm mb-4">
                      The market owner must deposit 10% of the total pool as stake before proposing settlement.
                    </p>
                    {address && address.toLowerCase() === (settlementInfo[5] as string)?.toLowerCase() && (
                      <button
                        onClick={async () => {
                          try {
                            setPendingAction('depositStake');
                            const stakeAmount = ((totalYesAmount || 0n) + (totalNoAmount || 0n)) / 10n;
                            await depositOwnerStake(formatEther(stakeAmount));
                          } catch (err) {
                            showToast('Failed to deposit stake: ' + (err as Error).message, 'error');
                            setPendingAction(null);
                          }
                        }}
                        disabled={isPending || isConfirming}
                        className="w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                      >
                        {isPending || isConfirming ? '⏳ Depositing...' : '💰 Deposit Stake (10% of Pool)'}
                      </button>
                    )}
                  </div>
                )}

                {/* Step 2: Propose Settlement */}
                {settlementInfo[4] > 0n && !settlementInfo[0] && ( // ownerStake > 0 && !isSettlementProposed
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-6">
                    <h4 className="text-lg font-bold text-blue-400 mb-3">Step 2: Propose Settlement Outcome</h4>
                    <p className="text-gray-300 text-sm mb-4">
                      Owner can now propose the final outcome. This will start a 24-hour challenge period.
                    </p>
                    {address && address.toLowerCase() === (settlementInfo[5] as string)?.toLowerCase() && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <button
                            onClick={async () => {
                              try {
                                setPendingAction('proposeSettlement');
                                await proposeSettlement(true);
                              } catch (err) {
                                showToast('Failed to propose settlement: ' + (err as Error).message, 'error');
                                setPendingAction(null);
                              }
                            }}
                            disabled={isPending || isConfirming}
                            className="py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                          >
                            ✅ Propose YES Won
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                setPendingAction('proposeSettlement');
                                await proposeSettlement(false);
                              } catch (err) {
                                showToast('Failed to propose settlement: ' + (err as Error).message, 'error');
                                setPendingAction(null);
                              }
                            }}
                            disabled={isPending || isConfirming}
                            className="py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                          >
                            ❌ Propose NO Won
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: Challenge Period */}
                {settlementInfo[0] && !isSettled && ( // isSettlementProposed && !isSettled
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6">
                    <h4 className="text-lg font-bold text-yellow-400 mb-3">Step 3: Challenge Period (24 Hours)</h4>
                    <div className="space-y-3">
                      <div className="bg-gray-700/50 rounded-lg p-4">
                        <p className="text-gray-300 text-sm mb-2">Proposed Outcome:</p>
                        <p className={`text-2xl font-bold ${settlementInfo[1] ? 'text-green-400' : 'text-red-400'}`}>
                          {settlementInfo[1] ? '✅ YES' : '❌ NO'}
                        </p>
                      </div>
                      <div className="bg-gray-700/50 rounded-lg p-4">
                        <p className="text-gray-300 text-sm mb-2">Challenge Deadline:</p>
                        <Countdown
                          deadline={settlementInfo[3]}
                          label="Time Remaining"
                        />
                      </div>

                      {/* Challenge Button */}
                      {hasCommitted && Date.now() < Number(settlementInfo[3]) * 1000 && (
                        <button
                          onClick={async () => {
                            try {
                              setPendingAction('challengeSettlement');
                              await challengeSettlement();
                            } catch (err) {
                              showToast('Failed to challenge: ' + (err as Error).message, 'error');
                              setPendingAction(null);
                            }
                          }}
                          disabled={isPending || isConfirming}
                          className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                        >
                          {isPending || isConfirming ? '⏳ Challenging...' : '⚠️ Challenge Settlement'}
                        </button>
                      )}

                      {/* Finalize Button */}
                      {Date.now() >= Number(settlementInfo[3]) * 1000 && (
                        <button
                          onClick={async () => {
                            try {
                              setPendingAction('finalizeSettlement');
                              await finalizeSettlement();
                            } catch (err) {
                              showToast('Failed to finalize: ' + (err as Error).message, 'error');
                              setPendingAction(null);
                            }
                          }}
                          disabled={isPending || isConfirming}
                          className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                        >
                          {isPending || isConfirming ? '⏳ Finalizing...' : '✅ Finalize Settlement'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Final Outcome */}
            {isSettled && (
              <div className={`rounded-lg p-6 mb-6 ${
                finalOutcome
                  ? 'bg-green-500/10 border border-green-500/30'
                  : 'bg-red-500/10 border border-red-500/30'
              }`}>
                <p className={`text-2xl font-bold mb-2 ${finalOutcome ? 'text-green-400' : 'text-red-400'}`}>
                  Final Outcome: {finalOutcome ? '✅ YES' : '❌ NO'}
                </p>
                <p className="text-gray-300">
                  The market has been settled. {finalOutcome ? 'YES' : 'NO'} predictions won!
                </p>
              </div>
            )}

            {/* Claim Rewards */}
            {isSettled && hasCommitted && !hasClaimed && (() => {
              // Check if anyone won (winning side amount > 0)
              const winningAmount = finalOutcome ? totalYesAmount : totalNoAmount;
              const hasWinners = winningAmount && Number(winningAmount) > 0;

              if (!hasWinners) {
                // No one won, show info message
                return (
                  <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                    <p className="text-gray-400 text-center">
                      ℹ️ No rewards to claim - no one predicted the winning outcome
                    </p>
                  </div>
                );
              }

              // Check if user has decrypted their prediction
              const userHasDecrypted = showDecrypted && decryptedPrediction !== null;
              let userPrediction: 'YES' | 'NO' | null = null;
              let userWon: boolean | null = null;

              if (userHasDecrypted) {
                userPrediction = decryptedPrediction === 1 ? 'YES' : 'NO';
                userWon = (decryptedPrediction === 1 && finalOutcome) || (decryptedPrediction === 0 && !finalOutcome);
              }

              // If we know user lost, show info message
              if (userWon === false) {
                return (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                    <p className="text-red-300 text-center">
                      ❌ You predicted <strong>{userPrediction}</strong>, but the outcome was <strong>{finalOutcome ? 'YES' : 'NO'}</strong>. No rewards to claim.
                    </p>
                  </div>
                );
              }

              // If user hasn't decrypted yet, suggest decrypting first
              if (userWon === null) {
                return (
                  <div className="space-y-3">
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                      <p className="text-blue-300 text-center text-sm">
                        🔒 Your prediction is encrypted. Decrypt it first to check if you won.
                      </p>
                    </div>
                    <button
                      onClick={handleDecryptMyPrediction}
                      disabled={isDecrypting}
                      className="w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                    >
                      {isDecrypting ? '🔓 Decrypting...' : '🔍 View My Prediction (Requires Signature)'}
                    </button>
                  </div>
                );
              }

              // If we know user won, show Claim button
              return (
                <div>
                  {userWon === true && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-3">
                      <p className="text-green-400 text-center font-semibold">
                        🎉 Congratulations! You predicted <strong>{userPrediction}</strong> and won!
                      </p>
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        setPendingAction('claimRewards');
                        await claimRewards();
                      } catch (err: any) {
                        // Check if it's a "You lost" error
                        const errorMessage = err?.message || '';
                        if (errorMessage.includes('You lost') || errorMessage.includes('execution reverted')) {
                          showToast('❌ You did not predict the winning outcome. No rewards to claim.', 'error');
                        } else {
                          showToast('Failed to claim: ' + errorMessage, 'error');
                        }
                        setPendingAction(null);
                      }
                    }}
                    disabled={!isConnected || isPending || isConfirming}
                    className="w-full py-4 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                  >
                    {isPending || isConfirming ? '⏳ Claiming...' : '💰 Claim Rewards'}
                  </button>
                </div>
              );
            })()}

            {hasClaimed && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <p className="text-green-400 text-center">
                  ✅ You have already claimed your rewards!
                </p>
              </div>
            )}

            {!hasCommitted && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <p className="text-gray-400 text-center">
                  You did not participate in this market.
                </p>
              </div>
            )}

            {/* Owner Settlement Controls - Only for Event Markets */}
            {!isSettled && address && marketType === 0 && (
              <div className="mt-6 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6">
                <h4 className="text-yellow-400 font-bold mb-4">Owner Controls</h4>
                <p className="text-gray-300 text-sm mb-4">
                  As the market owner, you can settle the market with the final outcome.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={async () => {
                      try {
                        setPendingAction('settleMarket');
                        await settleMarket(true);
                      } catch (err) {
                        showToast('Failed to settle: ' + (err as Error).message, 'error');
                        setPendingAction(null);
                      }
                    }}
                    disabled={isPending || isConfirming}
                    className="py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 text-white font-bold rounded-lg transition-colors"
                  >
                    Settle: YES
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        setPendingAction('settleMarket');
                        await settleMarket(false);
                      } catch (err) {
                        showToast('Failed to settle: ' + (err as Error).message, 'error');
                        setPendingAction(null);
                      }
                    }}
                    disabled={isPending || isConfirming}
                    className="py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-600 text-white font-bold rounded-lg transition-colors"
                  >
                    Settle: NO
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* How It Works */}
        <div className="mt-8 bg-gray-800/50 rounded-lg p-6 border border-gray-700">
          <h3 className="text-white font-semibold mb-3">🔐 How Privacy Works</h3>
          <ul className="text-gray-400 text-sm space-y-2">
            <li>• Your prediction is encrypted using Fully Homomorphic Encryption (FHE)</li>
            <li>• No one can see your choice during the commitment phase</li>
            <li>• After commitment ends, predictions are aggregated without revealing individual choices</li>
            <li>• Winners receive proportional rewards based on their encrypted bets</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

