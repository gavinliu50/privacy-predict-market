/**
 * FHE client-side decryption utility
 * Uses Zama's Relayer SDK and EIP-712 signature for client-side decryption
 */

declare global {
  interface Window {
    relayerSDK?: any;
  }
}

/**
 * Decrypt a single euint8 value
 * @param handle Encrypted data handle (bytes32)
 * @param contractAddress Contract address
 * @param userAddress User address
 * @param signer Ethers signer object
 * @returns Decrypted value
 */
export async function decryptUint8(
  handle: string,
  contractAddress: string,
  userAddress: string,
  signer: any
): Promise<number> {
  if (!window.relayerSDK) {
    throw new Error('Relayer SDK not loaded');
  }

  const sdk = window.relayerSDK;

  // Get or create fhEVM instance
  const instance = await sdk.createInstance(sdk.SepoliaConfig);

  // Generate temporary keypair
  const keypair = instance.generateKeypair();

  // Prepare decryption request
  const handleContractPairs = [
    {
      handle: handle,
      contractAddress: contractAddress,
    },
  ];

  const startTimeStamp = Math.floor(Date.now() / 1000).toString();
  const durationDays = '10'; // 10 days validity
  const contractAddresses = [contractAddress];

  // Create EIP-712 signature data
  const eip712 = instance.createEIP712(
    keypair.publicKey,
    contractAddresses,
    startTimeStamp,
    durationDays,
  );

  // User signs to authorize decryption
  const signature = await signer.signTypedData(
    eip712.domain,
    {
      UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
    },
    eip712.message,
  );

  // Call Relayer for decryption
  const result = await instance.userDecrypt(
    handleContractPairs,
    keypair.privateKey,
    keypair.publicKey,
    signature.replace('0x', ''),
    contractAddresses,
    userAddress,
    startTimeStamp,
    durationDays,
  );

  // Return decrypted value
  const decryptedValue = result[handle];

  return Number(decryptedValue);
}

/**
 * Decrypt a single euint64 value
 * @param handle Encrypted data handle (bytes32)
 * @param contractAddress Contract address
 * @param userAddress User address
 * @param signer Ethers signer object
 * @returns Decrypted value (bigint)
 */
export async function decryptUint64(
  handle: string,
  contractAddress: string,
  userAddress: string,
  signer: any
): Promise<bigint> {
  if (!window.relayerSDK) {
    throw new Error('Relayer SDK not loaded');
  }

  const sdk = window.relayerSDK;

  // Get or create fhEVM instance
  const instance = await sdk.createInstance(sdk.SepoliaConfig);

  // Generate temporary keypair
  const keypair = instance.generateKeypair();

  // Prepare decryption request
  const handleContractPairs = [
    {
      handle: handle,
      contractAddress: contractAddress,
    },
  ];

  const startTimeStamp = Math.floor(Date.now() / 1000).toString();
  const durationDays = '10'; // 10 days validity
  const contractAddresses = [contractAddress];

  // Create EIP-712 signature data
  const eip712 = instance.createEIP712(
    keypair.publicKey,
    contractAddresses,
    startTimeStamp,
    durationDays,
  );

  // User signs to authorize decryption
  const signature = await signer.signTypedData(
    eip712.domain,
    {
      UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
    },
    eip712.message,
  );

  // Call Relayer for decryption
  const result = await instance.userDecrypt(
    handleContractPairs,
    keypair.privateKey,
    keypair.publicKey,
    signature.replace('0x', ''),
    contractAddresses,
    userAddress,
    startTimeStamp,
    durationDays,
  );

  // Return decrypted value
  const decryptedValue = result[handle];

  return BigInt(decryptedValue);
}

/**
 * Batch decrypt euint8 and euint64 values (only need to sign once)
 * @param handles Array of handles to decrypt
 * @param contractAddress Contract address
 * @param userAddress User address
 * @param signer Ethers signer object
 * @returns Array of decrypted values
 */
export async function decryptBatch(
  handles: string[],
  contractAddress: string,
  userAddress: string,
  signer: any
): Promise<{ [handle: string]: string }> {
  if (!window.relayerSDK) {
    throw new Error('Relayer SDK not loaded');
  }

  const sdk = window.relayerSDK;

  // Get or create fhEVM instance
  const instance = await sdk.createInstance(sdk.SepoliaConfig);

  // Generate temporary keypair
  const keypair = instance.generateKeypair();

  // Prepare decryption request
  const handleContractPairs = handles.map(handle => ({
    handle: handle,
    contractAddress: contractAddress,
  }));

  const startTimeStamp = Math.floor(Date.now() / 1000).toString();
  const durationDays = '10'; // 10 days validity
  const contractAddresses = [contractAddress];

  // Create EIP-712 signature data
  const eip712 = instance.createEIP712(
    keypair.publicKey,
    contractAddresses,
    startTimeStamp,
    durationDays,
  );

  // User signs to authorize decryption (only sign once!)
  const signature = await signer.signTypedData(
    eip712.domain,
    {
      UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
    },
    eip712.message,
  );

  // Call Relayer for batch decryption
  const result = await instance.userDecrypt(
    handleContractPairs,
    keypair.privateKey,
    keypair.publicKey,
    signature.replace('0x', ''),
    contractAddresses,
    userAddress,
    startTimeStamp,
    durationDays,
  );

  return result;
}

