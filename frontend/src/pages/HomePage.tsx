import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useMarketList, useMarketInfo } from '../hooks/useMarketFactory';
import { formatEther } from 'viem';
import { useReadContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import BlindOracleABI from '../BlindOracleABI.json';

interface MarketCardProps {
  marketAddress: string;
}

function MarketCard({ marketAddress }: MarketCardProps) {
  const { marketInfo } = useMarketInfo(marketAddress as `0x${string}`);

  // Read market real-time data
  const { data: totalPool } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: BlindOracleABI.abi,
    functionName: 'getBalance',
  });

  const { data: participantCount } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: BlindOracleABI.abi,
    functionName: 'getParticipantCount',
  });

  const { data: currentPhase } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: BlindOracleABI.abi,
    functionName: 'currentPhase',
  });

  // Read market type
  const { data: marketType } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: BlindOracleABI.abi,
    functionName: 'marketType',
  });

  if (!marketInfo) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
        <div className="h-6 bg-gray-700 rounded w-3/4 mb-4"></div>
        <div className="h-4 bg-gray-700 rounded w-1/2"></div>
      </div>
    );
  }

  const [creator, description, commitmentDeadline, eventDeadline] = marketInfo;

  const phaseNames = ['🔒 Blind Commitment', '⚙️ Aggregating', '⏳ Awaiting Decryption', '🏆 Settled'];
  const phaseName = currentPhase !== undefined ? phaseNames[Number(currentPhase)] : '...';

  const now = Date.now() / 1000;
  const commitmentEndsIn = Number(commitmentDeadline) - now;
  const eventEndsIn = Number(eventDeadline) - now;

  const formatTimeLeft = (seconds: number) => {
    if (seconds <= 0) return 'Ended';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <Link
      to={`/market/${marketAddress}`}
      className="block bg-gray-800 rounded-lg p-6 hover:bg-gray-750 transition-colors border border-gray-700 hover:border-blue-500"
    >
      {/* Phase Badge */}
      <div className="flex items-center justify-between mb-4">
        <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium">
          {phaseName}
        </span>
        <span className="text-gray-400 text-sm">
          {commitmentEndsIn > 0 ? `Ends in ${formatTimeLeft(commitmentEndsIn)}` : 'Commitment Ended'}
        </span>
      </div>

      {/* Description */}
      <h3 className="text-xl font-bold text-white mb-3 line-clamp-2">{description}</h3>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-gray-400 text-sm">Total Pool</p>
          <p className="text-white font-bold text-lg">
            {totalPool ? `${formatEther(totalPool as bigint)} ETH` : '0 ETH'}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-sm">Participants</p>
          <p className="text-white font-bold text-lg">{participantCount?.toString() || '0'}</p>
        </div>
      </div>

      {/* Event Deadline */}
      <div className="pt-4 border-t border-gray-700">
        <p className="text-gray-400 text-sm">
          Event resolves in: <span className="text-white font-medium">{formatTimeLeft(eventEndsIn)}</span>
        </p>
      </div>

      {/* Creator and Market Type */}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Created by {creator.slice(0, 6)}...{creator.slice(-4)}
        </div>

        {/* Market Type Badge */}
        {marketType !== undefined && (
          <div className="flex items-center gap-1">
            {Number(marketType) === 0 ? (
              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs font-medium flex items-center gap-1">
                📝 Event
              </span>
            ) : (
              <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-medium flex items-center gap-1">
                💰 Price
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

// Hook to read isSettled status for a market
function useMarketSettled(marketAddress: string) {
  const { data: isSettled } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: BlindOracleABI.abi,
    functionName: 'isSettled',
  });
  return isSettled as boolean | undefined;
}

// Component to track settled status
function MarketSettledTracker({
  marketAddress,
  onSettledChange
}: {
  marketAddress: string;
  onSettledChange: (marketAddress: string, settled: boolean) => void
}) {
  const isSettled = useMarketSettled(marketAddress);

  useEffect(() => {
    if (isSettled !== undefined) {
      onSettledChange(marketAddress, isSettled);
    }
  }, [isSettled, marketAddress, onSettledChange]);

  return null;
}

export default function HomePage() {
  const [offset, setOffset] = useState(0);
  const limit = 12;

  const { markets, isLoading, refetch } = useMarketList(offset, limit);

  // Track settled status for each market
  const [settledStatus, setSettledStatus] = useState<Record<string, boolean>>({});

  const handleSettledChange = useCallback((marketAddress: string, settled: boolean) => {
    setSettledStatus(prev => ({ ...prev, [marketAddress]: settled }));
  }, []);

  // Calculate active markets (not settled)
  const validMarkets = markets?.filter((m) => m !== '0x0000000000000000000000000000000000000000') || [];
  const activeMarketsCount = validMarkets.filter(m => !settledStatus[m]).length;

  useEffect(() => {
    // Refresh market list every 10 seconds
    const interval = setInterval(() => {
      refetch();
    }, 10000);

    return () => clearInterval(interval);
  }, [refetch]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <div className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                The Blind Oracle
              </h1>
              <p className="text-gray-400 mt-2">Privacy-Preserving Prediction Markets</p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/my-positions"
                className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-lg transition-colors"
              >
                📊 My Positions
              </Link>
              <Link
                to="/create"
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
              >
                + Create Market
              </Link>
              <ConnectButton />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <p className="text-gray-400 text-sm mb-2">Total Markets</p>
            <p className="text-3xl font-bold text-white">{validMarkets.length}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <p className="text-gray-400 text-sm mb-2">Active Markets</p>
            <p className="text-3xl font-bold text-green-400">
              {activeMarketsCount}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <p className="text-gray-400 text-sm mb-2">Privacy Protected</p>
            <p className="text-3xl font-bold text-blue-400">🔒 100%</p>
          </div>
        </div>

        {/* Markets Grid */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-6">All Markets</h2>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-gray-800 rounded-lg p-6 animate-pulse">
                  <div className="h-6 bg-gray-700 rounded w-3/4 mb-4"></div>
                  <div className="h-4 bg-gray-700 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : markets && markets.length > 0 ? (
            <>
              {/* Hidden trackers to monitor settled status */}
              {validMarkets.map((marketAddress) => (
                <MarketSettledTracker
                  key={`tracker-${marketAddress}`}
                  marketAddress={marketAddress}
                  onSettledChange={handleSettledChange}
                />
              ))}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {validMarkets.map((marketAddress) => (
                  <MarketCard key={marketAddress} marketAddress={marketAddress} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-400 text-lg mb-4">No markets yet</p>
              <Link
                to="/create"
                className="inline-block px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
              >
                Create the First Market
              </Link>
            </div>
          )}
        </div>

        {/* Pagination */}
        {markets && markets.length >= limit && (
          <div className="flex justify-center gap-4 mt-8">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + limit)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

