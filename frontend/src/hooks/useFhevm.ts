import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';

// Declare window type extensions
declare global {
  interface Window {
    ethereum?: any;
    relayerSDK?: any;  // UMD CDN script exposes relayerSDK
  }
}

type FhevmInstance = any;

// Singleton pattern: ensure only one initialization
let globalFhevmInstance: FhevmInstance | null = null;
let initPromise: Promise<FhevmInstance> | null = null;

// Wait for UMD SDK to load
async function waitForSDK(maxWaitTime: number = 30000): Promise<any> {
  const startTime = Date.now();

  while (!window.relayerSDK) {
    const elapsed = Date.now() - startTime;

    if (elapsed > maxWaitTime) {
      throw new Error('Relayer SDK loading timeout (30s). Please check if CDN script is correctly loaded in index.html');
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return window.relayerSDK;
}

// Initialize FHEVM instance (singleton)
async function initFhevmInstance(): Promise<FhevmInstance> {
  // If instance already exists, return it
  if (globalFhevmInstance) {
    return globalFhevmInstance;
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    return initPromise;
  }

  // Start new initialization
  initPromise = (async () => {
    try {
      const sdk = await waitForSDK();

      // Initialize SDK (load WASM module)
      try {
        await sdk.initSDK();
      } catch (sdkError) {
        // Don't throw error, continue (WASM might already be loaded)
      }

      // Wait a bit to ensure WASM is fully initialized
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Create instance using SepoliaConfig (without network parameter)
      const instance = await sdk.createInstance(sdk.SepoliaConfig);

      globalFhevmInstance = instance;
      return instance;
    } catch (error) {
      initPromise = null; // Reset to allow retry
      throw error;
    }
  })();

  return initPromise;
}

export function useFhevm() {
  const [fhevmInstance, setFhevmInstance] = useState<FhevmInstance | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { chain, isConnected } = useAccount();

  useEffect(() => {
    const initFhevm = async () => {
      // Only initialize when wallet is connected and on Sepolia network
      if (!isConnected || !chain || chain.id !== 11155111) {
        return;
      }

      // If instance already exists, don't re-initialize
      if (fhevmInstance) {
        return;
      }

      // Check Cross-Origin Isolation
      if (!window.crossOriginIsolated) {
        const err = new Error('Browser environment does not support FHEVM: missing Cross-Origin Isolation. Please check meta tags in index.html.');
        setError(err);
        return;
      }

      try {
        setIsInitializing(true);
        setError(null);

        // Use singleton initialization function
        const instance = await initFhevmInstance();

        setFhevmInstance(instance);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsInitializing(false);
      }
    };

    initFhevm();
  }, [chain, isConnected, fhevmInstance]);

  return {
    fhevmInstance,
    isInitializing,
    error,
  };
}

