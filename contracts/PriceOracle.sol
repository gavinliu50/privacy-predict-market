// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PriceOracle - Simple Price Oracle for Crypto Assets
/// @notice Provides price data for ETH, BTC, and SOL
/// @dev In production, this should integrate with Chainlink or other decentralized oracles
contract PriceOracle {
    // ============ Structs ============
    
    struct PriceData {
        uint256 price;        // Price in USD (scaled by 1e8, e.g., $50000.00 = 5000000000000)
        uint256 timestamp;    // Last update timestamp
        address updater;      // Address that updated the price
    }

    // ============ State Variables ============
    
    /// @notice Supported assets
    enum Asset {
        ETH,
        BTC,
        SOL
    }

    /// @notice Price data for each asset
    mapping(Asset => PriceData) public prices;

    /// @notice Authorized price updaters (in production, this would be Chainlink nodes)
    mapping(address => bool) public isUpdater;

    /// @notice Contract owner
    address public owner;

    /// @notice Maximum price age (24 hours)
    uint256 public constant MAX_PRICE_AGE = 24 hours;

    // ============ Events ============
    
    event PriceUpdated(Asset indexed asset, uint256 price, uint256 timestamp, address updater);
    event UpdaterAdded(address indexed updater);
    event UpdaterRemoved(address indexed updater);

    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyUpdater() {
        require(isUpdater[msg.sender], "Not authorized updater");
        _;
    }

    // ============ Constructor ============
    
    constructor() {
        owner = msg.sender;
        isUpdater[msg.sender] = true;
        
        // Initialize with some default prices (for testing)
        prices[Asset.ETH] = PriceData({
            price: 3500_00000000,  // $3,500
            timestamp: block.timestamp,
            updater: msg.sender
        });
        
        prices[Asset.BTC] = PriceData({
            price: 95000_00000000,  // $95,000
            timestamp: block.timestamp,
            updater: msg.sender
        });
        
        prices[Asset.SOL] = PriceData({
            price: 180_00000000,  // $180
            timestamp: block.timestamp,
            updater: msg.sender
        });
    }

    // ============ Admin Functions ============
    
    /// @notice Add a new price updater
    function addUpdater(address updater) external onlyOwner {
        require(updater != address(0), "Invalid address");
        isUpdater[updater] = true;
        emit UpdaterAdded(updater);
    }

    /// @notice Remove a price updater
    function removeUpdater(address updater) external onlyOwner {
        isUpdater[updater] = false;
        emit UpdaterRemoved(updater);
    }

    // ============ Price Update Functions ============
    
    /// @notice Update price for a single asset
    /// @param asset The asset to update
    /// @param price The new price (scaled by 1e8)
    function updatePrice(Asset asset, uint256 price) external onlyUpdater {
        require(price > 0, "Invalid price");
        
        prices[asset] = PriceData({
            price: price,
            timestamp: block.timestamp,
            updater: msg.sender
        });
        
        emit PriceUpdated(asset, price, block.timestamp, msg.sender);
    }

    /// @notice Update prices for multiple assets in one transaction
    /// @param assets Array of assets to update
    /// @param newPrices Array of new prices (scaled by 1e8)
    function updatePrices(Asset[] calldata assets, uint256[] calldata newPrices) external onlyUpdater {
        require(assets.length == newPrices.length, "Length mismatch");
        
        for (uint256 i = 0; i < assets.length; i++) {
            require(newPrices[i] > 0, "Invalid price");
            
            prices[assets[i]] = PriceData({
                price: newPrices[i],
                timestamp: block.timestamp,
                updater: msg.sender
            });
            
            emit PriceUpdated(assets[i], newPrices[i], block.timestamp, msg.sender);
        }
    }

    // ============ Price Query Functions ============
    
    /// @notice Get the latest price for an asset
    /// @param asset The asset to query
    /// @return price The latest price (scaled by 1e8)
    /// @return timestamp The timestamp of the price update
    function getPrice(Asset asset) external view returns (uint256 price, uint256 timestamp) {
        PriceData memory data = prices[asset];
        require(data.timestamp > 0, "Price not available");
        require(block.timestamp - data.timestamp <= MAX_PRICE_AGE, "Price too old");
        
        return (data.price, data.timestamp);
    }

    /// @notice Get price data without staleness check (for historical queries)
    /// @param asset The asset to query
    /// @return price The latest price (scaled by 1e8)
    /// @return timestamp The timestamp of the price update
    function getPriceUnsafe(Asset asset) external view returns (uint256 price, uint256 timestamp) {
        PriceData memory data = prices[asset];
        require(data.timestamp > 0, "Price not available");
        
        return (data.price, data.timestamp);
    }

    /// @notice Check if a price is fresh (within MAX_PRICE_AGE)
    /// @param asset The asset to check
    /// @return isFresh True if the price is fresh
    function isPriceFresh(Asset asset) external view returns (bool isFresh) {
        PriceData memory data = prices[asset];
        if (data.timestamp == 0) return false;
        return block.timestamp - data.timestamp <= MAX_PRICE_AGE;
    }

    /// @notice Compare current price with a target price
    /// @param asset The asset to check
    /// @param targetPrice The target price to compare against (scaled by 1e8)
    /// @return isAbove True if current price >= target price
    function isPriceAboveTarget(Asset asset, uint256 targetPrice) external view returns (bool isAbove) {
        PriceData memory data = prices[asset];
        require(data.timestamp > 0, "Price not available");
        require(block.timestamp - data.timestamp <= MAX_PRICE_AGE, "Price too old");
        
        return data.price >= targetPrice;
    }
}

