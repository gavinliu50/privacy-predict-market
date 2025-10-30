import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatEther } from 'viem';
import { useUserPositions } from '../hooks/useUserPositions';

export default function MyPositionsPage() {
  const { isConnected } = useAccount();
  const { activePositions, settledPositions, isLoading } = useUserPositions();

  const totalMarkets = activePositions.length + settledPositions.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <div className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/"
                className="text-gray-400 hover:text-white transition-colors"
              >
                ← Back
              </Link>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                My Positions
              </h1>
            </div>
            <ConnectButton />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isConnected ? (
          <div className="bg-gray-800 rounded-lg p-12 text-center border border-gray-700">
            <div className="text-6xl mb-4">🔌</div>
            <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-6">
              Please connect your wallet to view your positions
            </p>
            <ConnectButton />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400 text-sm mb-1">Total Markets</p>
                <p className="text-3xl font-bold text-white">{totalMarkets}</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400 text-sm mb-1">Active Positions</p>
                <p className="text-3xl font-bold text-blue-400">{activePositions.length}</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400 text-sm mb-1">Settled Markets</p>
                <p className="text-3xl font-bold text-green-400">{settledPositions.length}</p>
              </div>
            </div>

            {/* Active Positions */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-4">🔥 Active Positions</h2>
              {isLoading ? (
                <div className="bg-gray-800 rounded-lg p-12 text-center border border-gray-700">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-gray-400">Loading your positions...</p>
                </div>
              ) : activePositions.length === 0 ? (
                <div className="bg-gray-800 rounded-lg p-12 text-center border border-gray-700">
                  <div className="text-6xl mb-4">📊</div>
                  <h3 className="text-xl font-bold text-white mb-2">No Active Positions</h3>
                  <p className="text-gray-400 mb-6">
                    You haven't participated in any active markets yet
                  </p>
                  <Link
                    to="/"
                    className="inline-block px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
                  >
                    Browse Markets
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {activePositions.map((position) => (
                    <Link
                      key={position.marketAddress}
                      to={`/market/${position.marketAddress}`}
                      className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-blue-500 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-white mb-2">
                            {position.description}
                          </h3>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-blue-400">
                              Phase {position.phase}
                            </span>
                            <span className="text-gray-400">
                              Pool: {formatEther(position.totalPool)} ETH
                            </span>
                            <span className="text-gray-400">
                              Participants: {position.participantCount.toString()}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="inline-block px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-semibold">
                            Active
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Settled Positions */}
            <div>
              <h2 className="text-2xl font-bold text-white mb-4">🏆 Settled Markets</h2>
              {settledPositions.length === 0 ? (
                <div className="bg-gray-800 rounded-lg p-12 text-center border border-gray-700">
                  <div className="text-6xl mb-4">🎯</div>
                  <h3 className="text-xl font-bold text-white mb-2">No Settled Markets</h3>
                  <p className="text-gray-400">
                    Your settled markets will appear here
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {settledPositions.map((position) => (
                    <Link
                      key={position.marketAddress}
                      to={`/market/${position.marketAddress}`}
                      className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-green-500 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-white mb-2">
                            {position.description}
                          </h3>
                          <div className="flex items-center gap-4 text-sm">
                            <span className={position.finalOutcome ? 'text-green-400' : 'text-red-400'}>
                              Result: {position.finalOutcome ? '✅ YES' : '❌ NO'}
                            </span>
                            <span className="text-gray-400">
                              YES: {position.totalYesAmount ? formatEther(position.totalYesAmount) : '0'} ETH
                            </span>
                            <span className="text-gray-400">
                              NO: {position.totalNoAmount ? formatEther(position.totalNoAmount) : '0'} ETH
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          {position.hasClaimed ? (
                            <span className="inline-block px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-semibold">
                              Claimed
                            </span>
                          ) : (
                            <span className="inline-block px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm font-semibold">
                              Claim Available
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

