//Brainstorming what we are trying to build
//Raffle

//Enter the lottery(paying some amount)
//Pic a random winner(verifiable random)
//Winner to be selected every X minutes -> Completely automated

//Chainlink Oracle -> Randomness, Automated Execution(chainlink keepers)
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

// Import this file to use console.log
import "hardhat/console.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error NotEnoughFunds();
error TransferFailded();
error RaffleNotOpen();
error Raffle_UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffleState);

/**@title A Sample Raffle Contract
 * @author Spencer Shelton
 * @notice This contract is for creating an untamperable decentralized smart contract
 * @dev This implements chainlink VRF v2 and Chainlink keepers
 */
contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /** Type Declrations  */
    enum RaffleState {
        OPEN,
        CALCULATING
    }

    /* State Variables */
    uint256 private immutable i_entranceFee;

    //need address to be payable cz we need to pay out player that wins
    address payable[] private s_players;

    //need to save coordinator
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;

    bytes32 private immutable i_maxGasForRandomNumber;
    uint64 private immutable i_subscriptionID;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint16 private constant NUM_WORDS = 1;

    //loter variables
    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;

    /* Events */
    //adding indexed key word allows receiver of event to see address, without index u need the abi to decode data
    event RaffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed winner);

    //how to init parents constructor (VRFConsumerBaseV2) add to end of constructor
    constructor(
        uint256 entranceFee,
        address vrfCoordinatorV2, //contract address (will need to deploy mock)
        bytes32 maxGasWillingToPayForRandomNumber,
        uint64 subscriptionID,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_maxGasForRandomNumber = maxGasWillingToPayForRandomNumber;
        i_subscriptionID = subscriptionID;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert NotEnoughFunds();
        }

        //check if lottery is open
        if (s_raffleState != RaffleState.OPEN) {
            revert RaffleNotOpen();
        }
        //s_players.push(msg.sender) wont work cz msg.sender is not payable so typecast to payable
        s_players.push(payable(msg.sender));

        //Emit an event when we update a dynamic array or mapping
        //events are very cheape because smart contract does not have access to them
        //events are strings that are printed out or viewd thru owners of contract
        emit RaffleEnter(msg.sender);
    }

    /**
     * @dev This is the function that the chainlink keeper nodes call
     * they look for the 1upkeepneeded to return true
     * the following should be true in order to return true
     * 1. Our time interval should have passed
     * 2. The lotery should have at least 1 player, and have some ETH
     * 3. Our subscription is funded with LINK
     * 4. The lottery should be in an open state
     */
    function checkUpkeep(
        bytes memory /* checkData */
    )
        public
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        bool isOpen = (RaffleState.OPEN == s_raffleState);
        //get current timestamp (block.timestamp)
        //how to tell how much time has passed?
        //we need current block.timestamp - last block timeStamp
        //we gonna need to check if current time stamp - last time stamp is greater then x interval
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        //check to see if we have players
        bool hasPlayers = (s_players.length > 0);
        //check if we have balance
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Raffle_UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }
        requestRandomWinner();
        //We highly recommend revalidating the upkeep in the performUpkeep function
        // We don't use the performData in this example. The performData is generated by the Keeper's call to your checkUpkeep function
    }

    function requestRandomWinner() internal {
        //request random number
        //once we git it, do something with it
        //2 transaction process
        /*
        Parameters for Request random Words
        1) keyhash - max gas fee willing to pay for request
        2) subsciptionId - the subscription id used for funding requests
        3) request confirmations - how many confirmations the chainlink node should wait before responding
        4) call back gas limit - limit to amount of gas used to get response
        5) numWords - number of random numbers to be returned
        RETURNS REQUESTID
        */
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestID = i_vrfCoordinator.requestRandomWords(
            i_maxGasForRandomNumber,
            i_subscriptionID,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );

        emit RequestedRaffleWinner(requestID);
    }

    function fulfillRandomWords(
        uint256, /*requestID*/
        uint256[] memory randomWords
    ) internal override {
        //pick a random number
        //we only request one randomword and its a unit256
        // s_players size 10
        //random number is 202
        //how do we get random number
        // 202 % 10 ? what doesnt divide evently into 202
        //2
        // 202 % 10 = 2

        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        s_raffleState = RaffleState.OPEN;
        s_players = new address payable[](0);
        s_lastTimeStamp = block.timestamp;
        (bool success, ) = recentWinner.call{value: address(this).balance}("");

        if (!success) {
            revert TransferFailded();
        }

        emit WinnerPicked(recentWinner);
    }

    /* view / pure functions */

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    //since  num words is a constant variable not stored in storage we can change view to pure
    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }
}
