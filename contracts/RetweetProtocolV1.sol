// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract RetweetProtocolV1 is ReentrancyGuard, Ownable, AccessControl {
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    using SafeERC20 for IERC20;

    IERC20 public immutable USDC;
    IERC20 public immutable USDT;
    IERC20 public immutable RetweetToken;

    address public treasury;
    uint256 public feePercentage;
    uint256 public bountyCounter;

    struct Contribution {
        uint256 amount;
        bool reclaimed;
    }

    struct Bounty {
        address creator;
        address token;
        uint256 totalAmount;
        uint256 lockupEnd;
        uint256 lockupDuration;
        bool isReleased;
        bool isClaimed;
        address recipient;
        mapping(address => Contribution) contributions;
        uint256 nid;
    }

    mapping(uint256 => Bounty) public bounties;
    mapping(address => uint256[]) public userBounties;

    event BountyAdded(uint256 bountyID, uint256 nid, address indexed creator, address token, uint256 amount, uint256 lockupDuration);
    event BountyIncreased(uint256 bountyID, address indexed contributor, address token, uint256 amount);
    event BountyReleased(uint256 bountyID, address indexed releaser, address recipient);
    event BountyClaimed(uint256 bountyID, address indexed claimer);
    event ContributionReclaimed(uint256 bountyID, address indexed contributor, uint256 amount);
    event LockupStarted(uint256 bountyID, uint256 lockupEnd);
    event TreasuryAddressSet(address treasury);
    event FeePercentageSet(uint256 feePercentage);

    constructor(
        address _USDC,
        address _USDT,
        address _RetweetToken,
        address _manager,
        address _oracle
    ) Ownable() {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(MANAGER_ROLE, _manager);
        _setupRole(ORACLE_ROLE, _oracle);

        USDC = IERC20(_USDC);
        USDT = IERC20(_USDT);
        RetweetToken = IERC20(_RetweetToken);
        bountyCounter = 0;
    }

    function addBounty(
		uint nid,
        address token,
        uint256 amount,
        uint256 lockupDuration
    ) external payable nonReentrant {
        require(
            token == address(USDC) || token == address(USDT) || token == address(RetweetToken) || token == address(0),
            "Unsupported token"
        );
        require(amount > 0, "Amount must be greater than 0");
		
		bountyCounter++;
		
        uint256 bountyID = bountyCounter;

        Bounty storage bounty = bounties[bountyID];
		bounty.nid = nid;
        bounty.creator = msg.sender;
        bounty.token = token;
        bounty.totalAmount = amount;
        bounty.lockupEnd = 0;
        bounty.lockupDuration = lockupDuration;
        bounty.isReleased = false;
        bounty.isClaimed = false;
        bounty.recipient = address(0);
        bounty.contributions[msg.sender] = Contribution(amount, false);

        if (token == address(0)) {
            require(msg.value == amount, "Incorrect ETH value sent");
        } else {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        userBounties[msg.sender].push(bountyID);

        emit BountyAdded(bountyID, nid, msg.sender, token, amount, lockupDuration);
    }

    function addToBounty(
        uint256 bountyID,
        address token,
        uint256 amount
    ) external payable nonReentrant {
        Bounty storage bounty = bounties[bountyID];
        require(bounty.creator != address(0), "Bounty does not exist");
        require(token == bounty.token, "Token type mismatch");
        require(amount > 0, "Amount must be greater than 0");

        bounty.totalAmount += amount;
        bounty.contributions[msg.sender].amount += amount;

        if (token == address(0)) {
            require(msg.value == amount, "Incorrect ETH value sent");
        } else {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        emit BountyIncreased(bountyID, msg.sender, token, amount);
    }

    function startLockup(uint256 bountyID) external onlyRole(ORACLE_ROLE) {
        Bounty storage bounty = bounties[bountyID];
        require(bounty.creator != address(0), "Bounty does not exist");
        require(bounty.lockupEnd == 0, "Lockup already started");

        bounty.lockupEnd = block.timestamp + bounty.lockupDuration;

        emit LockupStarted(bountyID, bounty.lockupEnd);
    }

    function releaseBounty(uint256 bountyID, address recipient) external onlyRole(ORACLE_ROLE) {
        Bounty storage bounty = bounties[bountyID];
        require(bounty.creator != address(0), "Bounty does not exist");
        require(!bounty.isReleased, "Bounty already released");
        require(block.timestamp >= bounty.lockupEnd, "Lockup period not over");

        bounty.isReleased = true;
        bounty.recipient = recipient;

        emit BountyReleased(bountyID, msg.sender, recipient);
    }

    function getBounty(uint256 bountyID) external nonReentrant {
        Bounty storage bounty = bounties[bountyID];
        require(bounty.isReleased, "Bounty not released");
        require(msg.sender == bounty.recipient, "Not authorized");
        require(!bounty.isClaimed, "Bounty already claimed");

        uint256 fee = 0;
        uint256 payoutAmount = bounty.totalAmount;

        if (bounty.token != address(RetweetToken)) {
            fee = (bounty.totalAmount * feePercentage) / 100;
            payoutAmount = bounty.totalAmount - fee;

            if (bounty.token == address(0)) {
                payable(treasury).transfer(fee);
                payable(msg.sender).transfer(payoutAmount);
            } else {
                IERC20(bounty.token).safeTransfer(treasury, fee);
                IERC20(bounty.token).safeTransfer(msg.sender, payoutAmount);
            }
        } else {
            IERC20(bounty.token).safeTransfer(msg.sender, bounty.totalAmount);
        }

        bounty.isClaimed = true;

        emit BountyClaimed(bountyID, msg.sender);
    }

    function reclaimContribution(uint256 bountyID) external nonReentrant {
        Bounty storage bounty = bounties[bountyID];
        require(!bounty.isReleased, "Bounty already released");
        require(block.timestamp >= bounty.lockupEnd, "Lockup period not over");

        Contribution storage contribution = bounty.contributions[msg.sender];
        require(contribution.amount > 0, "No contributions to reclaim");
        require(!contribution.reclaimed, "Contribution already reclaimed");

        uint256 amountToReclaim = contribution.amount;
        contribution.reclaimed = true;
        bounty.totalAmount -= amountToReclaim;

        if (bounty.token == address(0)) {
            payable(msg.sender).transfer(amountToReclaim);
        } else {
            IERC20(bounty.token).safeTransfer(msg.sender, amountToReclaim);
        }

        emit ContributionReclaimed(bountyID, msg.sender, amountToReclaim);
    }

    function getUserBounties(address user) external view returns (uint256[] memory) {
        return userBounties[user];
    }

    // Admin functions
    function setTreasuryAddress(address _treasury) external onlyRole(MANAGER_ROLE) {
        require(_treasury != address(0), "Invalid treasury address");
        treasury = _treasury;
        emit TreasuryAddressSet(_treasury);
    }

    function setFeePercentage(uint256 _feePercentage) external onlyRole(MANAGER_ROLE) {
        require(_feePercentage <= 10, "Fee percentage cannot exceed 10%");
        feePercentage = _feePercentage;
        emit FeePercentageSet(_feePercentage);
    }

    // Safe-measure functions

    receive() external payable {}
    fallback() external payable {}

    // Safe-measure to prevent any token lockup, excludes USDC, USDT and RetweetToken
    // Withdraw any token
    function withdrawTokens(address _token) public onlyOwner {
        require(
            _token != address(USDC) && 
            _token != address(USDT) && 
            _token != address(RetweetToken), 
            "Not allowed to withdraw specified token"
        );
        uint amount = IERC20(_token).balanceOf(address(this));
        IERC20(_token).safeTransfer(msg.sender, amount);
    }

    // Withdraw Ether
    function withdrawEther() public onlyOwner {
        payable(msg.sender).transfer(address(this).balance); 
    }
}