import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMarketFactory } from '../hooks/useMarketFactory';
import { CONTRACT_CONFIG } from '../config';
import { useAccount } from 'wagmi';
import { Toast } from '../components/Toast';
import type { ToastType } from '../components/Toast';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function CreateMarketPage() {
  const navigate = useNavigate();
  const { isConnected } = useAccount();
  const { createMarket, isPending, isConfirming, isConfirmed, error } = useMarketFactory();

  const [marketType, setMarketType] = useState<'event' | 'price'>('event');
  const [description, setDescription] = useState('');
  const [commitmentDeadline, setCommitmentDeadline] = useState('');
  const [eventDeadline, setEventDeadline] = useState('');

  // Price market specific fields
  const [targetAsset, setTargetAsset] = useState<'ETH' | 'BTC'>('ETH');
  const [targetPrice, setTargetPrice] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  // Handle transaction confirmation
  useEffect(() => {
    if (isConfirmed) {
      showToast('Market created successfully! 🎉', 'success');
      setIsSubmitting(false);
      // Navigate to homepage after 2 seconds
      setTimeout(() => {
        navigate('/');
      }, 2000);
    }
  }, [isConfirmed, navigate]);

  // Handle errors
  useEffect(() => {
    if (error) {
      showToast(`Error: ${error.message}`, 'error');
      setIsSubmitting(false);
    }
  }, [error]);

  // Get user timezone
  const getUserTimezone = () => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  };

  // Format datetime to local timezone string
  const formatDateTimeLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Format datetime display (with timezone)
  const formatDateTimeDisplay = (dateString: string) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  // Initialize default times
  useEffect(() => {
    const now = new Date();

    // Default commitment deadline: 1 hour from now
    const defaultCommitment = new Date(now.getTime() + 60 * 60 * 1000);
    const formattedCommitment = formatDateTimeLocal(defaultCommitment);
    setCommitmentDeadline(formattedCommitment);

    // Default event deadline: 24 hours from now
    const defaultEvent = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const formattedEvent = formatDateTimeLocal(defaultEvent);
    setEventDeadline(formattedEvent);
  }, []);

  // Auto-generate Description
  useEffect(() => {
    if (marketType === 'price' && targetAsset && targetPrice && eventDeadline) {
      const eventDate = new Date(eventDeadline);
      const formattedDate = eventDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });

      const assetName = targetAsset === 'ETH' ? 'Ethereum' : 'Bitcoin';
      const assetSymbol = targetAsset;
      const price = parseFloat(targetPrice).toLocaleString();

      const generatedDescription = `Will ${assetName} (${assetSymbol}) price be at or above $${price} on ${formattedDate}?`;
      setDescription(generatedDescription);
    } else if (marketType === 'event') {
      // For Event Market, clear auto-generated content and let user input manually
      if (description.startsWith('Will ') && (description.includes('Ethereum') || description.includes('Bitcoin'))) {
        setDescription('');
      }
    }
  }, [marketType, targetAsset, targetPrice, eventDeadline]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected) {
      showToast('Please connect your wallet first', 'error');
      return;
    }

    if (!description.trim()) {
      showToast('Please enter a market description', 'error');
      return;
    }

    if (!commitmentDeadline || !eventDeadline) {
      showToast('Please set both deadlines', 'error');
      return;
    }

    // Price market specific validation
    if (marketType === 'price') {
      if (!targetPrice || parseFloat(targetPrice) <= 0) {
        showToast('Please enter a valid target price', 'error');
        return;
      }
    }

    const commitmentDate = new Date(commitmentDeadline);
    const eventDate = new Date(eventDeadline);
    const now = new Date();

    if (commitmentDate <= now) {
      showToast('Commitment deadline must be in the future', 'error');
      return;
    }

    if (eventDate <= commitmentDate) {
      showToast('Event deadline must be after commitment deadline', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      // Calculate time parameters
      // commitmentDuration: time from now to commitment deadline
      const commitmentDuration = Math.floor((commitmentDate.getTime() - now.getTime()) / 1000);

      // eventDuration: time from commitment deadline to event deadline (fixed logic)
      const eventDuration = Math.floor((eventDate.getTime() - commitmentDate.getTime()) / 1000);

      // Prepare market type parameter
      const marketTypeEnum = marketType === 'event' ? 0 : 1;

      // Prepare price oracle parameter
      const priceOracleAddress = marketType === 'price'
        ? CONTRACT_CONFIG.priceOracleAddress as `0x${string}`
        : '0x0000000000000000000000000000000000000000' as `0x${string}`;

      // Prepare asset type
      const assetEnum = targetAsset === 'ETH' ? 0 : 1; // 0 = ETH, 1 = BTC

      // Prepare target price (scaled by 1e8)
      const targetPriceBigInt = marketType === 'price'
        ? BigInt(Math.floor(parseFloat(targetPrice) * 1e8))
        : BigInt(0);

      await createMarket(
        marketTypeEnum,
        description,
        commitmentDuration,
        eventDuration,
        priceOracleAddress,
        assetEnum,
        targetPriceBigInt
      );

      showToast('Transaction submitted! Waiting for confirmation...', 'info');
    } catch (err: any) {
      showToast(`Failed to create market: ${err.message}`, 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/"
                className="text-gray-400 hover:text-white transition-colors"
              >
                ← Back
              </Link>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Create New Market
              </h1>
            </div>
            <ConnectButton />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Market Type Selection */}
            <div>
              <label className="block text-white font-semibold mb-3">
                Market Type *
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setMarketType('event')}
                  className={`p-6 rounded-lg border-2 transition-all ${
                    marketType === 'event'
                      ? 'bg-purple-500/20 border-purple-500 shadow-lg shadow-purple-500/30'
                      : 'bg-gray-700/50 border-gray-600 hover:border-gray-500'
                  }`}
                >
                  <div className="text-4xl mb-2">📝</div>
                  <h3 className="text-white font-bold mb-1">Event Market</h3>
                  <p className="text-gray-400 text-sm">
                    Manually settled by creator with protection mechanisms
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setMarketType('price')}
                  className={`p-6 rounded-lg border-2 transition-all ${
                    marketType === 'price'
                      ? 'bg-green-500/20 border-green-500 shadow-lg shadow-green-500/30'
                      : 'bg-gray-700/50 border-gray-600 hover:border-gray-500'
                  }`}
                >
                  <div className="text-4xl mb-2">💰</div>
                  <h3 className="text-white font-bold mb-1">Price Market</h3>
                  <p className="text-gray-400 text-sm">
                    Automatically settled using price oracle
                  </p>
                </button>
              </div>

              {/* Market Type Info */}
              {marketType === 'event' && (
                <div className="mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-yellow-400 text-sm">
                    ⚠️ <strong>Event Market:</strong> You will manually settle this market. You cannot participate,
                    must deposit 10% stake, and users have 24 hours to challenge your settlement.
                  </p>
                </div>
              )}
              {marketType === 'price' && (
                <div className="mt-4 bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <p className="text-green-400 text-sm mb-2">
                    🤖 <strong>Price Market:</strong> This market will be automatically settled using Chainlink price oracle.
                    No manual intervention required.
                  </p>
                  <p className="text-green-300/70 text-xs">
                    ℹ️ Note: Chainlink updates prices when they change by 0.5% or every 1-3 hours on testnet.
                    Settlement will use the latest price at the event deadline.
                  </p>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-white font-semibold mb-2">
                Market Description *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  marketType === 'price'
                    ? 'Auto-generated based on your settings...'
                    : 'e.g., Will Bitcoin reach $120,000 by end of 2025?'
                }
                className={`w-full px-4 py-3 rounded-lg border focus:outline-none resize-none ${
                  marketType === 'price'
                    ? 'bg-gray-800 text-gray-300 border-gray-700 cursor-not-allowed'
                    : 'bg-gray-700 text-white border-gray-600 focus:border-blue-500'
                }`}
                rows={3}
                maxLength={200}
                required
                readOnly={marketType === 'price'}
              />
              <p className="text-gray-400 text-sm mt-2">
                {marketType === 'price' ? (
                  <span className="text-green-400">✨ Auto-generated from your price prediction settings</span>
                ) : (
                  <span>{description.length}/200 characters</span>
                )}
              </p>
            </div>

            {/* Price Market Specific Fields */}
            {marketType === 'price' && (
              <>
                <div>
                  <label className="block text-white font-semibold mb-2">
                    Target Asset *
                  </label>
                  <select
                    value={targetAsset}
                    onChange={(e) => setTargetAsset(e.target.value as 'ETH' | 'BTC')}
                    className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                    required
                  >
                    <option value="ETH">🔷 Ethereum (ETH)</option>
                    <option value="BTC">🟠 Bitcoin (BTC)</option>
                  </select>
                  <p className="text-gray-400 text-sm mt-2">
                    Select the cryptocurrency to track
                  </p>
                </div>

                <div>
                  <label className="block text-white font-semibold mb-2">
                    Target Price (USD) *
                  </label>
                  <input
                    type="number"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="e.g., 5000"
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                    required
                  />
                  <p className="text-gray-400 text-sm mt-2">
                    💡 The market will settle as YES if the price is <strong>at or above</strong> this target,
                    otherwise NO.
                  </p>
                </div>
              </>
            )}


            {/* Time Settings Section */}
            <div className="bg-gray-700/30 border border-gray-600 rounded-lg p-6 space-y-4">
              <div className="flex flex-col gap-2 mb-4">
                <h3 className="text-white font-bold text-lg">⏰ Time Settings</h3>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-400">
                    🌍 Your timezone: <span className="text-blue-400 font-medium">{getUserTimezone()}</span>
                  </span>
                  <span className="text-gray-400">
                    🕐 Current time: <span className="text-green-400 font-medium">{new Date().toLocaleString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      timeZoneName: 'short'
                    })}</span>
                  </span>
                </div>
              </div>

              {/* Commitment Deadline */}
              <div>
                <label className="block text-white font-semibold mb-2">
                  1️⃣ Commitment Deadline *
                </label>
                <input
                  type="datetime-local"
                  value={commitmentDeadline}
                  onChange={(e) => setCommitmentDeadline(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  required
                />
                <p className="text-gray-400 text-sm mt-2">
                  🔒 <strong>Blind commitment phase ends:</strong> Users can submit encrypted predictions until this time.
                </p>
              </div>

              {/* Event Deadline */}
              <div>
                <label className="block text-white font-semibold mb-2">
                  2️⃣ Event Deadline (Settlement Available) *
                </label>
                <input
                  type="datetime-local"
                  value={eventDeadline}
                  onChange={(e) => setEventDeadline(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  required
                />
                <p className="text-gray-400 text-sm mt-2">
                  ✅ <strong>Settlement becomes available:</strong> The market can be settled after this time.
                </p>
              </div>

              {/* Time Duration Display */}
              {commitmentDeadline && eventDeadline && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mt-4">
                  <h4 className="text-blue-400 font-semibold mb-3">📊 Time Breakdown</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">🔒 Commitment Phase:</span>
                      <span className="text-white font-semibold">
                        {(() => {
                          const duration = Math.floor((new Date(commitmentDeadline).getTime() - Date.now()) / 1000);
                          const hours = Math.floor(duration / 3600);
                          const minutes = Math.floor((duration % 3600) / 60);
                          return `${hours}h ${minutes}m`;
                        })()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">⏳ Waiting Period:</span>
                      <span className="text-white font-semibold">
                        {(() => {
                          const duration = Math.floor((new Date(eventDeadline).getTime() - new Date(commitmentDeadline).getTime()) / 1000);
                          const hours = Math.floor(duration / 3600);
                          const minutes = Math.floor((duration % 3600) / 60);
                          return `${hours}h ${minutes}m`;
                        })()}
                      </span>
                    </div>
                    <div className="border-t border-blue-500/30 pt-2 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-blue-400 font-semibold">📅 Total Duration:</span>
                        <span className="text-blue-300 font-bold text-lg">
                          {(() => {
                            const duration = Math.floor((new Date(eventDeadline).getTime() - Date.now()) / 1000);
                            const days = Math.floor(duration / 86400);
                            const hours = Math.floor((duration % 86400) / 3600);
                            const minutes = Math.floor((duration % 3600) / 60);
                            if (days > 0) {
                              return `${days}d ${hours}h ${minutes}m`;
                            }
                            return `${hours}h ${minutes}m`;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <h3 className="text-blue-400 font-semibold mb-2">📋 Market Summary</h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>• Commitment ends at: <span className="text-white font-medium">{formatDateTimeDisplay(commitmentDeadline)}</span></li>
                <li>• Event resolves at: <span className="text-white font-medium">{formatDateTimeDisplay(eventDeadline)}</span></li>
                {marketType === 'event' ? (
                  <li>• You will be the market owner and can manually settle the outcome</li>
                ) : (
                  <li>• Market will be automatically settled by price oracle</li>
                )}
                <li>• All predictions are encrypted and private during commitment phase</li>
              </ul>
            </div>

            {/* Wallet Status */}
            {!isConnected && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-yellow-400 text-sm">
                  ⚠️ Please connect your wallet to create a market
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!isConnected || isSubmitting || isPending || isConfirming}
              className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors text-lg"
            >
              {isSubmitting || isPending
                ? '⏳ Submitting Transaction...'
                : isConfirming
                ? '⏳ Confirming...'
                : '🚀 Create Market'}
            </button>

            {/* Status Messages */}
            {isPending && (
              <p className="text-yellow-400 text-center text-sm">
                Please confirm the transaction in your wallet...
              </p>
            )}
            {isConfirming && (
              <p className="text-blue-400 text-center text-sm">
                Transaction submitted! Waiting for confirmation...
              </p>
            )}
          </form>
        </div>

        {/* Help Section */}
        <div className="mt-8 bg-gray-800/50 rounded-lg p-6 border border-gray-700">
          <h3 className="text-white font-semibold mb-3">💡 Tips for Creating a Good Market</h3>
          <ul className="text-gray-400 text-sm space-y-2">
            <li>• Make the description clear and unambiguous</li>
            <li>• <strong className="text-white">Short-term events:</strong> Set commitment deadline within hours (e.g., "BTC price in 1 hour")</li>
            <li>• <strong className="text-white">Long-term events:</strong> Set commitment deadline in days (e.g., "Election results in 30 days")</li>
            <li>• Set a reasonable commitment period to allow enough participation</li>
            <li>• Ensure the event can be objectively verified</li>
            <li>• Event deadline should give enough time for the outcome to be clear</li>
            <li>• As the creator, you'll be responsible for settling the outcome</li>
            <li>• 🕐 <strong className="text-white">Pro tip:</strong> You can now set exact date and time for precise predictions!</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

