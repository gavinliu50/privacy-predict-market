// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint8, euint64, externalEuint8, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { PriceOracle } from "./PriceOracle.sol";

/// @title BlindOracle - Privacy-Preserving Prediction Market
/// @notice A production-ready prediction market with three phases: Blind Commitment, Price Discovery, and Free Trading
/// @dev Uses Zama fhEVM for homomorphic encryption with async decryption via Gateway
contract BlindOracle is SepoliaConfig {
    // ============ Enums ============

    /// @notice Market phases (Simplified - removed FreeTrading/AMM)
    enum Phase {
        BlindCommitment,      // Phase 0: Users submit encrypted predictions
        Aggregating,          // Phase 1: Aggregating encrypted bets
        AwaitingDecryption,   // Phase 2: Waiting for decryption callback
        Settled               // Phase 3: Market settled, winners can claim
    }

    /// @notice Market types
    enum MarketType {
        Event,      // Event prediction - manually settled by owner
        Price       // Price prediction - automatically settled via oracle
    }

    // ============ Structs ============

    /// @notice User commitment data
    struct Commitment {
        euint8 encryptedPrediction;  // 0 = NO, 1 = YES
        euint64 encryptedAmount;     // Bet amount in wei
        bool hasCommitted;
    }

    // ============ State Variables ============

    /// @notice Current market phase
    Phase public currentPhase;

    /// @notice Market type
    MarketType public marketType;

    /// @notice Market owner (can trigger phase transitions and settlement)
    address public owner;

    /// @notice Event description
    string public eventDescription;

    /// @notice Deadline for blind commitment phase
    uint256 public commitmentDeadline;

    /// @notice Deadline for the event (after which settlement can occur)
    uint256 public eventDeadline;

    // Price prediction specific fields
    /// @notice Price oracle contract (only for price prediction markets)
    PriceOracle public priceOracle;

    /// @notice Target asset for price prediction (only for price markets)
    PriceOracle.Asset public targetAsset;

    /// @notice Target price for prediction (scaled by 1e8, only for price markets)
    uint256 public targetPrice;

    // Phase 1: User commitments
    /// @notice User commitments mapping
    mapping(address => Commitment) private commitments;

    /// @notice List of all participants
    address[] public participants;

    // Phase 2: Encrypted aggregates
    /// @notice Encrypted total amount bet on YES
    euint64 private encryptedTotalYes;

    /// @notice Encrypted total amount bet on NO
    euint64 private encryptedTotalNo;

    /// @notice Request ID for aggregate decryption
    uint256 private aggregateDecryptionRequestId;

    /// @notice Whether aggregation has been completed
    bool public isAggregated;

    // Phase 3: Decrypted aggregates (Simplified - removed AMM/Token variables)
    /// @notice Total amount bet on YES (decrypted)
    uint256 public totalYesAmount;

    /// @notice Total amount bet on NO (decrypted)
    uint256 public totalNoAmount;

    // Phase 3: Settlement
    /// @notice Whether the market has been settled
    bool public isSettled;

    /// @notice Final outcome: true = YES won, false = NO won
    bool public finalOutcome;

    /// @notice Timestamp when settlement was proposed (for challenge period)
    uint256 public settlementProposedTime;

    /// @notice Proposed outcome (during challenge period)
    bool public proposedOutcome;

    /// @notice Whether settlement has been proposed (waiting for challenge period)
    bool public isSettlementProposed;

    /// @notice Challenge period duration (24 hours)
    uint256 public constant CHALLENGE_PERIOD = 24 hours;

    /// @notice Owner's stake (10% of total pool, locked until settlement is finalized)
    uint256 public ownerStake;

    /// @notice Track if user has claimed rewards
    mapping(address => bool) public hasClaimed;

    // Claim rewards tracking (Simplified - removed token allocation)
    /// @notice Pending claim requests
    mapping(address => uint256) private claimRequestIds;

    // ============ Events ============

    event MarketCreated(string eventDescription, uint256 commitmentDeadline, uint256 eventDeadline);
    event PredictionCommitted(address indexed user);
    event PhaseTransitioned(Phase newPhase);
    event AggregationStarted();
    event DecryptionRequested(uint256 requestId);
    event PriceDiscovered(uint256 totalYes, uint256 totalNo);
    event SettlementProposed(bool outcome, uint256 challengeDeadline);
    event SettlementChallenged(address indexed challenger);
    event MarketSettled(bool outcome);
    event OwnerStakeDeposited(uint256 amount);
    event OwnerStakeReturned(uint256 amount);
    event OwnerStakeSlashed(uint256 amount);
    event ClaimRequested(address indexed user, uint256 requestId);
    event RewardsClaimed(address indexed user, uint256 amount);

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    modifier onlyInPhase(Phase _phase) {
        require(currentPhase == _phase, "Invalid phase for this operation");
        _;
    }

    // ============ Constructor ============

    /// @notice Create a new prediction market
    /// @param _marketType Type of market (Event or Price)
    /// @param _eventDescription Description of the event to predict
    /// @param _commitmentDuration Duration of the blind commitment phase (in seconds)
    /// @param _eventDuration Duration from commitment deadline to event deadline (in seconds)
    /// @param _priceOracle Address of the price oracle contract (only for price markets, use address(0) for event markets)
    /// @param _targetAsset The asset to track (only for price markets)
    /// @param _targetPrice The target price to predict (scaled by 1e8, only for price markets)
    constructor(
        MarketType _marketType,
        string memory _eventDescription,
        uint256 _commitmentDuration,
        uint256 _eventDuration,
        address _priceOracle,
        PriceOracle.Asset _targetAsset,
        uint256 _targetPrice
    ) {
        owner = msg.sender;
        currentPhase = Phase.BlindCommitment;
        marketType = _marketType;
        eventDescription = _eventDescription;
        commitmentDeadline = block.timestamp + _commitmentDuration;
        // Event deadline is calculated from commitment deadline, not deployment time
        eventDeadline = commitmentDeadline + _eventDuration;

        // Validate price market parameters
        if (_marketType == MarketType.Price) {
            require(_priceOracle != address(0), "Invalid oracle address");
            require(_targetPrice > 0, "Invalid target price");

            priceOracle = PriceOracle(_priceOracle);
            targetAsset = _targetAsset;
            targetPrice = _targetPrice;
        }

        emit MarketCreated(_eventDescription, commitmentDeadline, eventDeadline);
    }

    // ============ Phase 1: Blind Commitment ============

    /// @notice Submit an encrypted prediction and bet amount
    /// @param encryptedPrediction Encrypted prediction (0 = NO, 1 = YES)
    /// @param encryptedAmount Encrypted bet amount in wei
    /// @param predictionProof Zero-knowledge proof for the prediction
    /// @param amountProof Zero-knowledge proof for the amount
    function commitPrediction(
        externalEuint8 encryptedPrediction,
        externalEuint64 encryptedAmount,
        bytes calldata predictionProof,
        bytes calldata amountProof
    ) external payable onlyInPhase(Phase.BlindCommitment) {
        require(block.timestamp < commitmentDeadline, "Commitment period has ended");
        require(!commitments[msg.sender].hasCommitted, "Already committed");
        require(msg.value > 0, "Must send ETH with commitment");

        // Protection 1: Owner cannot participate in their own market (for Event markets)
        if (marketType == MarketType.Event) {
            require(msg.sender != owner, "Owner cannot participate in event markets");
        }

        // Convert external encrypted inputs to internal encrypted types
        euint8 prediction = FHE.fromExternal(encryptedPrediction, predictionProof);
        euint64 amount = FHE.fromExternal(encryptedAmount, amountProof);

        // Store encrypted commitment
        commitments[msg.sender] = Commitment({
            encryptedPrediction: prediction,
            encryptedAmount: amount,
            hasCommitted: true
        });
        
        participants.push(msg.sender);

        // Grant FHE permissions for user to decrypt their own commitment
        FHE.allowThis(prediction);
        FHE.allow(prediction, msg.sender);
        FHE.allowThis(amount);
        FHE.allow(amount, msg.sender);

        emit PredictionCommitted(msg.sender);
    }

    /// @notice Get my encrypted commitment (only callable by the user who committed)
    /// @return prediction Encrypted prediction
    /// @return amount Encrypted amount
    function getMyCommitment() external view returns (euint8 prediction, euint64 amount) {
        require(commitments[msg.sender].hasCommitted, "No commitment found");
        Commitment storage commitment = commitments[msg.sender];
        return (commitment.encryptedPrediction, commitment.encryptedAmount);
    }

    // ============ Phase 2: Price Discovery ============

    /// @notice Step 1: Aggregate all encrypted bets using FHE operations
    /// @dev Callable by anyone after commitment deadline (Simplified - removed onlyOwner)
    function aggregateBets() external onlyInPhase(Phase.BlindCommitment) {
        require(block.timestamp >= commitmentDeadline, "Commitment period not ended");
        require(participants.length > 0, "No participants");

        // Initialize encrypted aggregates to zero
        encryptedTotalYes = FHE.asEuint64(0);
        encryptedTotalNo = FHE.asEuint64(0);

        // Aggregate all encrypted bets using homomorphic operations
        for (uint256 i = 0; i < participants.length; i++) {
            address participant = participants[i];
            Commitment storage commitment = commitments[participant];

            euint8 prediction = commitment.encryptedPrediction;
            euint64 amount = commitment.encryptedAmount;

            // Create flags: isYes = 1 if prediction == 1, else 0
            euint8 isYes = prediction;
            // isNo = 1 - isYes
            euint8 isNo = FHE.sub(FHE.asEuint8(1), prediction);

            // Convert euint8 flags to euint64 for multiplication
            euint64 isYes64 = FHE.asEuint64(isYes);
            euint64 isNo64 = FHE.asEuint64(isNo);

            // Calculate contributions: amount * flag
            euint64 yesContribution = FHE.mul(amount, isYes64);
            euint64 noContribution = FHE.mul(amount, isNo64);

            // Add to running totals
            encryptedTotalYes = FHE.add(encryptedTotalYes, yesContribution);
            encryptedTotalNo = FHE.add(encryptedTotalNo, noContribution);
        }

        // Grant permissions for this contract to use the aggregated values
        FHE.allowThis(encryptedTotalYes);
        FHE.allowThis(encryptedTotalNo);

        isAggregated = true;

        // Transition to Aggregating phase
        currentPhase = Phase.Aggregating;
        emit AggregationStarted();
        emit PhaseTransitioned(Phase.Aggregating);
    }

    /// @notice Step 2: Request decryption of aggregated totals via Gateway
    /// @dev Callable by anyone (Simplified - removed onlyOwner)
    function requestAggregateDecryption() external onlyInPhase(Phase.Aggregating) {
        require(isAggregated, "Bets not aggregated yet");

        // Prepare ciphertexts for decryption
        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(encryptedTotalYes);
        cts[1] = FHE.toBytes32(encryptedTotalNo);

        // Request decryption with callback to callbackAggregateDecryption
        aggregateDecryptionRequestId = FHE.requestDecryption(
            cts,
            this.callbackAggregateDecryption.selector
        );

        // Transition to AwaitingDecryption phase
        currentPhase = Phase.AwaitingDecryption;
        emit DecryptionRequested(aggregateDecryptionRequestId);
        emit PhaseTransitioned(Phase.AwaitingDecryption);
    }

    /// @notice Callback function for aggregate decryption results
    /// @dev Called by the decryption oracle with decrypted values
    /// @param requestId The request ID from requestDecryption
    /// @param cleartexts ABI-encoded decrypted values
    /// @param decryptionProof KMS signatures and proof data
    function callbackAggregateDecryption(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) public {
        require(requestId == aggregateDecryptionRequestId, "Invalid request ID");
        require(currentPhase == Phase.AwaitingDecryption, "Invalid phase");

        // Verify signatures from KMS
        FHE.checkSignatures(requestId, cleartexts, decryptionProof);

        // Decode decrypted values (uint64, uint64)
        (uint64 yesAmount, uint64 noAmount) = abi.decode(cleartexts, (uint64, uint64));

        totalYesAmount = uint256(yesAmount);
        totalNoAmount = uint256(noAmount);

        // Simplified: Skip FreeTrading, go directly to Settled
        // Owner will set the final outcome
        currentPhase = Phase.Settled;

        emit PriceDiscovered(totalYesAmount, totalNoAmount);
        emit PhaseTransitioned(Phase.Settled);
    }

    // ============ Phase 3: Settlement ============

    /// @notice Owner deposits stake (10% of total pool) before proposing settlement
    /// @dev Protection 2: Owner must stake to prevent malicious settlement
    function depositOwnerStake() external payable onlyOwner onlyInPhase(Phase.Settled) {
        require(marketType == MarketType.Event, "Only for event markets");
        require(!isSettlementProposed, "Settlement already proposed");
        require(ownerStake == 0, "Stake already deposited");

        uint256 totalPool = totalYesAmount + totalNoAmount;
        uint256 requiredStake = totalPool / 10; // 10% of total pool

        require(msg.value >= requiredStake, "Insufficient stake");

        ownerStake = msg.value;
        emit OwnerStakeDeposited(msg.value);
    }

    /// @notice Propose settlement outcome (starts 24-hour challenge period)
    /// @dev Protection 3: Challenge period allows users to dispute
    /// @param outcome The proposed outcome: true = YES won, false = NO won
    function proposeSettlement(bool outcome) external onlyOwner onlyInPhase(Phase.Settled) {
        require(marketType == MarketType.Event, "Only for event markets");
        require(!isSettled, "Already settled");
        require(!isSettlementProposed, "Settlement already proposed");
        require(block.timestamp >= eventDeadline, "Event not ended yet");
        require(ownerStake > 0, "Must deposit stake first");

        proposedOutcome = outcome;
        isSettlementProposed = true;
        settlementProposedTime = block.timestamp;

        emit SettlementProposed(outcome, block.timestamp + CHALLENGE_PERIOD);
    }

    /// @notice Finalize settlement after challenge period expires
    /// @dev Can be called by anyone after 24 hours
    function finalizeSettlement() external onlyInPhase(Phase.Settled) {
        require(marketType == MarketType.Event, "Only for event markets");
        require(isSettlementProposed, "Settlement not proposed");
        require(!isSettled, "Already settled");
        require(block.timestamp >= settlementProposedTime + CHALLENGE_PERIOD, "Challenge period not ended");

        finalOutcome = proposedOutcome;
        isSettled = true;

        // Return stake to owner
        uint256 stakeToReturn = ownerStake;
        ownerStake = 0;
        (bool success, ) = owner.call{value: stakeToReturn}("");
        require(success, "Stake return failed");

        emit OwnerStakeReturned(stakeToReturn);
        emit MarketSettled(finalOutcome);
    }

    /// @notice Challenge a proposed settlement (placeholder for future dispute mechanism)
    /// @dev In a full implementation, this would trigger a dispute resolution process
    function challengeSettlement() external onlyInPhase(Phase.Settled) {
        require(isSettlementProposed, "No settlement to challenge");
        require(!isSettled, "Already settled");
        require(block.timestamp < settlementProposedTime + CHALLENGE_PERIOD, "Challenge period ended");
        require(commitments[msg.sender].hasCommitted, "Must be a participant");

        // For now, just emit an event
        // In a full implementation, this would:
        // 1. Pause the settlement
        // 2. Trigger a dispute resolution mechanism (e.g., DAO vote, multi-sig arbitration)
        // 3. Potentially slash owner's stake if challenge is valid

        emit SettlementChallenged(msg.sender);

        // TODO: Implement full dispute resolution
        // For MVP, challenges are recorded but don't automatically block settlement
    }

    /// @notice Automatically settle price prediction market using oracle
    /// @dev Can be called by anyone after event deadline
    /// @dev Requires aggregation and decryption to be completed first
    function settlePriceMarket() external {
        require(marketType == MarketType.Price, "Only for price markets");
        require(!isSettled, "Already settled");
        require(block.timestamp >= eventDeadline, "Event not ended yet");
        require(address(priceOracle) != address(0), "Oracle not set");

        // Must be in Settled phase (after decryption callback)
        // If aggregation/decryption was forgotten, user must call them first
        require(currentPhase == Phase.Settled, "Must complete aggregation and decryption first");
        require(totalYesAmount > 0 || totalNoAmount > 0, "No bets to settle");

        // Get current price from oracle
        (uint256 currentPrice, ) = priceOracle.getPrice(targetAsset);

        // Determine outcome: YES if price >= target, NO otherwise
        finalOutcome = currentPrice >= targetPrice;
        isSettled = true;

        emit MarketSettled(finalOutcome);
    }

    /// @notice Request to claim rewards after settlement (Simplified - uses async decryption)
    /// @dev Winners receive their proportional share of the total pool
    function claimRewards() external onlyInPhase(Phase.Settled) {
        require(isSettled, "Market not settled yet");
        require(!hasClaimed[msg.sender], "Already claimed rewards");
        require(commitments[msg.sender].hasCommitted, "Did not participate");

        // Prepare ciphertexts for decryption (prediction and amount)
        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(commitments[msg.sender].encryptedPrediction);
        cts[1] = FHE.toBytes32(commitments[msg.sender].encryptedAmount);

        // Request decryption with callback
        uint256 requestId = FHE.requestDecryption(
            cts,
            this.callbackClaimRewards.selector
        );

        claimRequestIds[msg.sender] = requestId;

        emit ClaimRequested(msg.sender, requestId);
    }

    /// @notice Callback function for claim rewards decryption
    /// @dev Called by the decryption oracle to process reward claim
    function callbackClaimRewards(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) public {
        require(currentPhase == Phase.Settled, "Invalid phase");
        require(isSettled, "Market not settled");

        // Verify signatures from KMS
        FHE.checkSignatures(requestId, cleartexts, decryptionProof);

        // Find the user who made this request
        address user = address(0);
        for (uint256 i = 0; i < participants.length; i++) {
            if (claimRequestIds[participants[i]] == requestId) {
                user = participants[i];
                break;
            }
        }

        require(user != address(0), "User not found for request");
        require(!hasClaimed[user], "Already claimed");

        // Decode decrypted values (uint8 prediction, uint64 amount)
        (uint8 prediction, uint64 amount) = abi.decode(cleartexts, (uint8, uint64));

        // Check if user won
        bool won = (prediction == 1 && finalOutcome) || (prediction == 0 && !finalOutcome);
        require(won, "You lost");

        hasClaimed[user] = true;

        // Calculate payout: (user's amount / total winning amount) * total pool
        uint256 userAmount = uint256(amount);
        uint256 totalWinningAmount = finalOutcome ? totalYesAmount : totalNoAmount;
        uint256 totalPool = address(this).balance;
        uint256 payout = (userAmount * totalPool) / totalWinningAmount;

        // Transfer payout to user
        (bool success, ) = user.call{value: payout}("");
        require(success, "ETH transfer failed");

        emit RewardsClaimed(user, payout);
    }

    // ============ View Functions ============

    /// @notice Get number of participants
    function getParticipantCount() external view returns (uint256) {
        return participants.length;
    }

    /// @notice Get user's encrypted commitment (for client-side decryption)
    /// @param user The user address
    /// @return encryptedPrediction The encrypted prediction (euint8)
    /// @return encryptedAmount The encrypted amount (euint64)
    /// @return hasCommitted Whether the user has committed
    function getUserCommitment(address user) external view returns (
        euint8 encryptedPrediction,
        euint64 encryptedAmount,
        bool hasCommitted
    ) {
        Commitment memory commitment = commitments[user];
        return (
            commitment.encryptedPrediction,
            commitment.encryptedAmount,
            commitment.hasCommitted
        );
    }

    /// @notice Get participant address by index
    function getParticipant(uint256 index) external view returns (address) {
        require(index < participants.length, "Index out of bounds");
        return participants[index];
    }

    /// @notice Get contract balance
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Check if user has committed
    function hasUserCommitted(address user) external view returns (bool) {
        return commitments[user].hasCommitted;
    }

    /// @notice Get market info (Simplified - removed AMM-related fields)
    function getMarketInfo() external view returns (
        Phase phase,
        uint256 _commitmentDeadline,
        uint256 _eventDeadline,
        uint256 _totalYes,
        uint256 _totalNo,
        bool _isSettled,
        bool _finalOutcome
    ) {
        return (
            currentPhase,
            commitmentDeadline,
            eventDeadline,
            totalYesAmount,
            totalNoAmount,
            isSettled,
            finalOutcome
        );
    }

    /// @notice Get price market specific info
    function getPriceMarketInfo() external view returns (
        MarketType _marketType,
        address _priceOracle,
        PriceOracle.Asset _targetAsset,
        uint256 _targetPrice
    ) {
        return (
            marketType,
            address(priceOracle),
            targetAsset,
            targetPrice
        );
    }

    /// @notice Get settlement status info
    function getSettlementInfo() external view returns (
        bool _isSettlementProposed,
        bool _proposedOutcome,
        uint256 _settlementProposedTime,
        uint256 _challengeDeadline,
        uint256 _ownerStake,
        bool _canFinalize
    ) {
        uint256 challengeDeadline = isSettlementProposed
            ? settlementProposedTime + CHALLENGE_PERIOD
            : 0;

        bool canFinalize = isSettlementProposed
            && !isSettled
            && block.timestamp >= challengeDeadline;

        return (
            isSettlementProposed,
            proposedOutcome,
            settlementProposedTime,
            challengeDeadline,
            ownerStake,
            canFinalize
        );
    }
}

