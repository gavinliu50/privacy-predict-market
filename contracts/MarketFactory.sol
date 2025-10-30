// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./BlindOracle.sol";
import "./PriceOracle.sol";

/// @title MarketFactory
/// @notice Factory contract for creating multiple prediction markets
/// @dev Allows anyone to create new BlindOracle markets (Event or Price types)
contract MarketFactory {
    // ============ State Variables ============

    /// @notice Array of all created markets
    address[] public markets;

    /// @notice Mapping from creator to their created markets
    mapping(address => address[]) public creatorMarkets;

    /// @notice Market metadata
    struct MarketInfo {
        address marketAddress;
        address creator;
        string description;
        uint256 commitmentDeadline;
        uint256 eventDeadline;
        uint256 createdAt;
        bool isActive;
        BlindOracle.MarketType marketType;
    }

    /// @notice Mapping from market address to metadata
    mapping(address => MarketInfo) public marketInfo;

    // ============ Events ============

    event MarketCreated(
        address indexed marketAddress,
        address indexed creator,
        string description,
        BlindOracle.MarketType marketType,
        uint256 commitmentDuration,
        uint256 eventDuration,
        uint256 timestamp
    );

    // ============ Functions ============

    /// @notice Create a new prediction market
    /// @param _marketType Type of market (Event or Price)
    /// @param _description Description of the event to predict
    /// @param _commitmentDuration Duration of the blind commitment phase (in seconds)
    /// @param _eventDuration Duration until the event occurs (in seconds)
    /// @param _priceOracle Address of price oracle (only for Price markets, use address(0) for Event markets)
    /// @param _targetAsset Target asset for price prediction (only for Price markets)
    /// @param _targetPrice Target price for prediction (only for Price markets, scaled by 1e8)
    /// @return marketAddress Address of the newly created market
    function createMarket(
        BlindOracle.MarketType _marketType,
        string memory _description,
        uint256 _commitmentDuration,
        uint256 _eventDuration,
        address _priceOracle,
        PriceOracle.Asset _targetAsset,
        uint256 _targetPrice
    ) external returns (address marketAddress) {
        require(bytes(_description).length > 0, "Description cannot be empty");
        require(_commitmentDuration > 0, "Commitment duration must be positive");
        require(_eventDuration > 0, "Event duration must be positive");

        // Validate price market parameters
        if (_marketType == BlindOracle.MarketType.Price) {
            require(_priceOracle != address(0), "Price oracle required for price markets");
            require(_targetPrice > 0, "Target price must be positive");
        }

        // Deploy new BlindOracle contract
        BlindOracle newMarket = new BlindOracle(
            _marketType,
            _description,
            _commitmentDuration,
            _eventDuration,
            _priceOracle,
            _targetAsset,
            _targetPrice
        );

        marketAddress = address(newMarket);

        // Store market info
        marketInfo[marketAddress] = MarketInfo({
            marketAddress: marketAddress,
            creator: msg.sender,
            description: _description,
            commitmentDeadline: block.timestamp + _commitmentDuration,
            eventDeadline: block.timestamp + _eventDuration,
            createdAt: block.timestamp,
            isActive: true,
            marketType: _marketType
        });

        // Add to arrays
        markets.push(marketAddress);
        creatorMarkets[msg.sender].push(marketAddress);

        emit MarketCreated(
            marketAddress,
            msg.sender,
            _description,
            _marketType,
            _commitmentDuration,
            _eventDuration,
            block.timestamp
        );

        return marketAddress;
    }

    // ============ View Functions ============

    /// @notice Get total number of markets
    function getMarketCount() external view returns (uint256) {
        return markets.length;
    }

    /// @notice Get market address by index
    /// @param index Index in the markets array
    function getMarket(uint256 index) external view returns (address) {
        require(index < markets.length, "Index out of bounds");
        return markets[index];
    }

    /// @notice Get paginated list of markets
    /// @param offset Starting index
    /// @param limit Number of markets to return
    /// @return marketAddresses Array of market addresses
    function getMarkets(uint256 offset, uint256 limit) 
        external 
        view 
        returns (address[] memory marketAddresses) 
    {
        require(offset < markets.length, "Offset out of bounds");
        
        uint256 end = offset + limit;
        if (end > markets.length) {
            end = markets.length;
        }
        
        uint256 resultLength = end - offset;
        marketAddresses = new address[](resultLength);
        
        for (uint256 i = 0; i < resultLength; i++) {
            marketAddresses[i] = markets[offset + i];
        }
        
        return marketAddresses;
    }

    /// @notice Get all markets created by a specific user
    /// @param creator Address of the creator
    function getUserMarkets(address creator) external view returns (address[] memory) {
        return creatorMarkets[creator];
    }

    /// @notice Get number of markets created by a user
    /// @param creator Address of the creator
    function getUserMarketCount(address creator) external view returns (uint256) {
        return creatorMarkets[creator].length;
    }

    /// @notice Get detailed info for a market
    /// @param marketAddress Address of the market
    function getMarketInfo(address marketAddress) 
        external 
        view 
        returns (
            address creator,
            string memory description,
            uint256 commitmentDeadline,
            uint256 eventDeadline,
            uint256 createdAt,
            bool isActive
        ) 
    {
        MarketInfo memory info = marketInfo[marketAddress];
        require(info.marketAddress != address(0), "Market not found");
        
        return (
            info.creator,
            info.description,
            info.commitmentDeadline,
            info.eventDeadline,
            info.createdAt,
            info.isActive
        );
    }

    /// @notice Get multiple market infos at once
    /// @param marketAddresses Array of market addresses
    function getMultipleMarketInfos(address[] memory marketAddresses)
        external
        view
        returns (MarketInfo[] memory infos)
    {
        infos = new MarketInfo[](marketAddresses.length);
        
        for (uint256 i = 0; i < marketAddresses.length; i++) {
            infos[i] = marketInfo[marketAddresses[i]];
        }
        
        return infos;
    }

    /// @notice Check if an address is a valid market created by this factory
    /// @param marketAddress Address to check
    function isValidMarket(address marketAddress) external view returns (bool) {
        return marketInfo[marketAddress].marketAddress != address(0);
    }
}

