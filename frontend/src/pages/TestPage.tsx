import { useAccount } from 'wagmi';

export default function TestPage() {
  const { address, isConnected } = useAccount();

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Test Page</h1>
        <p className="text-xl">If you can see this, routing is working!</p>
        <div className="mt-8 p-4 bg-gray-800 rounded-lg">
          <p className="text-sm text-gray-400">Wagmi Test:</p>
          <p className="text-white">Connected: {isConnected ? 'Yes' : 'No'}</p>
          {address && <p className="text-sm text-gray-500 mt-2">{address}</p>}
        </div>
      </div>
    </div>
  );
}

