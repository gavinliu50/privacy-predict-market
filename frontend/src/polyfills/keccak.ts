// Keccak polyfill for browser environment
// This provides a browser-compatible implementation of keccak

import { keccak256 as viemKeccak256 } from 'viem'

// Create a keccak function that mimics the native module API
export function keccak(algorithm: string) {
  if (algorithm !== 'keccak256') {
    throw new Error(`Unsupported algorithm: ${algorithm}`)
  }
  
  return {
    update(data: string | Uint8Array) {
      this._data = data
      return this
    },
    digest(encoding?: string) {
      if (!this._data) {
        throw new Error('No data to digest')
      }
      
      // Convert data to hex string if needed
      let hexData: `0x${string}`
      if (typeof this._data === 'string') {
        hexData = this._data.startsWith('0x') 
          ? this._data as `0x${string}`
          : `0x${this._data}` as `0x${string}`
      } else {
        hexData = `0x${Array.from(this._data).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
      }
      
      const hash = viemKeccak256(hexData)
      
      if (encoding === 'hex') {
        return hash.slice(2) // Remove 0x prefix
      }
      
      // Return as Buffer-like object
      const bytes = hash.slice(2).match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
      return new Uint8Array(bytes)
    },
    _data: null as string | Uint8Array | null
  }
}

export default keccak

