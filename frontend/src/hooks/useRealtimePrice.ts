import { useState, useEffect } from 'react';

export const PriceAsset = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  SOL: 'solana',
} as const;

export type PriceAsset = typeof PriceAsset[keyof typeof PriceAsset];

interface RealtimePrice {
  price: number | undefined;
  timestamp: Date | undefined;
  isLoading: boolean;
  error: Error | null;
}

/**
 * 获取实时价格（用于显示，不用于结算）
 * 使用 CoinGecko 免费 API，每 10 秒更新一次
 */
export function useRealtimePrice(asset: PriceAsset): RealtimePrice {
  const [price, setPrice] = useState<number | undefined>(undefined);
  const [timestamp, setTimestamp] = useState<Date | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout;

    const fetchPrice = async () => {
      try {
        setIsLoading(true);

        // 使用 Binance API（无 CORS 限制，完全免费）
        let symbol = '';
        switch (asset) {
          case PriceAsset.ETH:
            symbol = 'ETHUSDT';
            break;
          case PriceAsset.BTC:
            symbol = 'BTCUSDT';
            break;
          case PriceAsset.SOL:
            symbol = 'SOLUSDT';
            break;
        }

        const response = await fetch(
          `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (isMounted && data.price) {
          setPrice(parseFloat(data.price));
          setTimestamp(new Date()); // Binance 不返回时间戳，使用当前时间
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err as Error);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // 立即获取一次
    fetchPrice();

    // 每 10 秒更新一次
    intervalId = setInterval(fetchPrice, 10000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [asset]);

  return {
    price,
    timestamp,
    isLoading,
    error,
  };
}

