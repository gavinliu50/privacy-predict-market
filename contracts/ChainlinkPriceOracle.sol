// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @title ChainlinkPriceOracle - Decentralized Price Oracle using Chainlink
/// @notice Provides real-time price data for ETH, BTC, and SOL using Chainlink Price Feeds
/// @dev Integrates with Chainlink's decentralized oracle network
contract ChainlinkPriceOracle {
    // ============ Structs ============
    
    /// @notice Supported assets
    enum Asset {
        ETH,
        BTC,
        SOL
    }

    // ============ State Variables ============
    
    /// @notice Chainlink price feed addresses for each asset
    mapping(Asset => address) public priceFeeds;
    
    /// @notice Contract owner
    address public owner;
    
    /// @notice Maximum price age (24 hours)
    uint256 public constant MAX_PRICE_AGE = 24 hours;

    // ============ Events ============
    
    event PriceFeedUpdated(Asset indexed asset, address indexed feedAddress);

    // ============ Errors ============
    
    error InvalidPriceFeed();
    error StalePrice();
    error InvalidPrice();
    error NotOwner();

    // ============ Modifiers ============
    
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ============ Constructor ============
    
    /// @notice Initialize with Chainlink price feed addresses
    /// @param _ethUsdFeed Chainlink ETH/USD price feed address
    /// @param _btcUsdFeed Chainlink BTC/USD price feed address
    /// @param _solUsdFeed Chainlink SOL/USD price feed address (use address(0) if not available)
    constructor(
        address _ethUsdFeed,
        address _btcUsdFeed,
        address _solUsdFeed
    ) {
        owner = msg.sender;
        
        // Validate and set price feeds
        if (_ethUsdFeed == address(0)) revert InvalidPriceFeed();
        if (_btcUsdFeed == address(0)) revert InvalidPriceFeed();
        
        priceFeeds[Asset.ETH] = _ethUsdFeed;
        priceFeeds[Asset.BTC] = _btcUsdFeed;
        priceFeeds[Asset.SOL] = _solUsdFeed; // Can be address(0) if not available
        
        emit PriceFeedUpdated(Asset.ETH, _ethUsdFeed);
        emit PriceFeedUpdated(Asset.BTC, _btcUsdFeed);
        if (_solUsdFeed != address(0)) {
            emit PriceFeedUpdated(Asset.SOL, _solUsdFeed);
        }
    }

    // ============ Core Functions ============
    
    /// @notice Get the latest price for an asset
    /// @param asset The asset to query
    /// @return price The latest price (scaled by 1e8, e.g., $50000.00 = 5000000000000)
    /// @return timestamp The timestamp of the price update
    function getPrice(Asset asset) 
        external 
        view 
        returns (uint256 price, uint256 timestamp) 
    {
        address feedAddress = priceFeeds[asset];
        if (feedAddress == address(0)) revert InvalidPriceFeed();
        
        AggregatorV3Interface priceFeed = AggregatorV3Interface(feedAddress);
        
        (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();
        
        // Validate price data
        if (answer <= 0) revert InvalidPrice();
        if (updatedAt == 0) revert InvalidPrice();
        if (answeredInRound < roundId) revert StalePrice();
        
        // Check if price is not too old
        if (block.timestamp - updatedAt > MAX_PRICE_AGE) revert StalePrice();
        
        // Chainlink returns price with 8 decimals, we keep the same format
        return (uint256(answer), updatedAt);
    }
    
    /// @notice Check if the current price is above a target price
    /// @param asset The asset to check
    /// @param targetPrice The target price to compare against (scaled by 1e8)
    /// @return isAbove True if current price >= target price
    function isPriceAboveTarget(Asset asset, uint256 targetPrice) 
        external 
        view 
        returns (bool isAbove) 
    {
        (uint256 currentPrice, ) = this.getPrice(asset);
        return currentPrice >= targetPrice;
    }
    
    /// @notice Get price with additional metadata
    /// @param asset The asset to query
    /// @return price The latest price
    /// @return timestamp The timestamp of the price update
    /// @return decimals The number of decimals in the price
    /// @return description The description of the price feed
    function getPriceWithMetadata(Asset asset)
        external
        view
        returns (
            uint256 price,
            uint256 timestamp,
            uint8 decimals,
            string memory description
        )
    {
        address feedAddress = priceFeeds[asset];
        if (feedAddress == address(0)) revert InvalidPriceFeed();
        
        AggregatorV3Interface priceFeed = AggregatorV3Interface(feedAddress);
        
        // Get price
        (price, timestamp) = this.getPrice(asset);
        
        // Get metadata
        decimals = priceFeed.decimals();
        description = priceFeed.description();
        
        return (price, timestamp, decimals, description);
    }

    // ============ Admin Functions ============
    
    /// @notice Update the price feed address for an asset
    /// @param asset The asset to update
    /// @param feedAddress The new Chainlink price feed address
    function updatePriceFeed(Asset asset, address feedAddress) 
        external 
        onlyOwner 
    {
        if (feedAddress == address(0)) revert InvalidPriceFeed();
        
        priceFeeds[asset] = feedAddress;
        emit PriceFeedUpdated(asset, feedAddress);
    }
    
    /// @notice Transfer ownership
    /// @param newOwner The new owner address
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidPriceFeed();
        owner = newOwner;
    }

    // ============ View Functions ============
    
    /// @notice Get the price feed address for an asset
    /// @param asset The asset to query
    /// @return feedAddress The Chainlink price feed address
    function getPriceFeed(Asset asset) external view returns (address feedAddress) {
        return priceFeeds[asset];
    }
    
    /// @notice Check if a price feed is available for an asset
    /// @param asset The asset to check
    /// @return isAvailable True if price feed is configured
    function isPriceFeedAvailable(Asset asset) external view returns (bool isAvailable) {
        return priceFeeds[asset] != address(0);
    }
}

