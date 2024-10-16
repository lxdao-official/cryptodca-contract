// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";

import "./ICryptoDCA.sol";

import "hardhat/console.sol";

contract CryptoDCA is
    ICryptoDCA,
    ReentrancyGuardUpgradeable,
    AccessControlUpgradeable
{
    event UpdatedFee(address operator, uint32 from, uint32 to);

    event UpdatedExecuteTolerance(address operator, uint32 from, uint32 to);

    event CreatedPlan(
        bytes32 pid,
        address from,
        address token0,
        address token1,
        address recipient,
        uint256 amount,
        uint256 amountPerTime,
        PlanExecuteFrequency frequency
    );

    event ExecutedPlan(
        bytes32 pid,
        address from,
        address token0,
        address token1,
        address recipient,
        uint256 amountIn,
        uint256 amountOut,
        uint256 balance,
        PlanStatus status
    );

    event FundedPlan(
        bytes32 pid,
        address from,
        uint256 amount,
        uint256 balance,
        PlanStatus status
    );

    event PausedPlan(bytes32 pid, address from);

    event ResumedPlan(bytes32 pid, address from);

    event CanceledPlan(bytes32 pid, address from);

    event WithdrawalFee(
        address from,
        address token,
        address recipient,
        uint256 amount
    );

    event Withdrawal(
        address from,
        address token,
        address recipient,
        uint256 amount
    );

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR");

    mapping(bytes32 => Plan) private plans;

    mapping(address => uint256) private totalPlanToken0Balance;

    mapping(address => mapping(address => uint256)) private userToken1Balance;

    // default is 50u
    uint256 private minimumAmountPerTime;
    // default is 0.15%
    uint32 private fee;
    // default is 15 minutes
    uint32 private executeTolerance;
    // swap router address
    address private uniSwapRouter;
    // plan token0 available
    mapping(address => bool) private token0sAvailable;

    receive() external payable {}

    /**
     * @dev Constructors are replaced by initialize function
     */
    function initialize(InitializeParams calldata params) external initializer {
        minimumAmountPerTime = 50;
        fee = 15;
        executeTolerance = 15 * 60;

        uniSwapRouter = params.uniSwapRouter;

        _grantRole(ADMIN_ROLE, params.admin);

        _setExecutors(params.executors);

        address[] memory empty = new address[](0);
        _setAvailableToken0s(params.availableToken0List, empty);
    }

    function version() public pure returns (string memory) {
        return "1.0.0";
    }

    function _setExecutors(address[] memory addresses) internal {
        for (uint256 i = 0; i < addresses.length; i++) {
            _grantRole(EXECUTOR_ROLE, addresses[i]);
        }
    }

    function setExecutors(
        address[] memory addresses
    ) external onlyRole(ADMIN_ROLE) {
        _setExecutors(addresses);
    }

    function revokeExecutors(
        address[] memory addresses
    ) external onlyRole(ADMIN_ROLE) {
        for (uint256 i = 0; i < addresses.length; i++) {
            _revokeRole(EXECUTOR_ROLE, addresses[i]);
        }
    }

    function isToken0Available(address token0) external view returns (bool) {
        return token0sAvailable[token0];
    }

    function setAvailableToken0List(
        address[] memory _addList,
        address[] memory _removeList
    ) external onlyRole(ADMIN_ROLE) {
        _setAvailableToken0s(_addList, _removeList);
    }

    function _setAvailableToken0s(
        address[] memory _addList,
        address[] memory _removeList
    ) private {
        for (uint256 i = 0; i < _addList.length; i++) {
            token0sAvailable[_addList[i]] = true;
        }
        for (uint256 i = 0; i < _removeList.length; i++) {
            token0sAvailable[_addList[i]] = false;
        }
    }

    function getExecuteTolerance() external view returns (uint32) {
        return executeTolerance;
    }

    function setExecuteTolerance(
        uint32 _executeTolerance
    ) external onlyRole(ADMIN_ROLE) {
        require(_executeTolerance != executeTolerance, "Invalid input");
        emit UpdatedExecuteTolerance(
            _msgSender(),
            executeTolerance,
            _executeTolerance
        );
        executeTolerance = _executeTolerance;
    }

    function getFee() external view returns (uint32) {
        return fee;
    }

    function setFee(uint32 _fee) external onlyRole(ADMIN_ROLE) {
        require(_fee != fee, "Invalid input");
        emit UpdatedFee(_msgSender(), fee, _fee);
        fee = _fee;
    }

    function getPID(
        address from,
        address token0,
        address token1,
        uint256 amountPerTime
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    block.chainid,
                    from,
                    token0,
                    token1,
                    amountPerTime
                )
            );
    }

    function _getSeconds(
        PlanExecuteFrequency cycle
    ) private pure returns (uint256) {
        uint256 totalSeconds = 4 weeks;
        if (cycle == PlanExecuteFrequency.ONE_HOUR) {
            totalSeconds = 1 hours;
        } else if (cycle == PlanExecuteFrequency.FOUR_HOURS) {
            totalSeconds = 4 hours;
        } else if (cycle == PlanExecuteFrequency.EIGHT_HOURS) {
            totalSeconds = 8 hours;
        } else if (cycle == PlanExecuteFrequency.TWELVE_HOURS) {
            totalSeconds = 12 hours;
        } else if (cycle == PlanExecuteFrequency.DAILY) {
            totalSeconds = 1 days;
        } else if (cycle == PlanExecuteFrequency.WEEKLY) {
            totalSeconds = 1 weeks;
        } else if (cycle == PlanExecuteFrequency.TWO_WEEK) {
            totalSeconds = 2 weeks;
        } else if (cycle == PlanExecuteFrequency.MONTHLY) {
            totalSeconds = 4 weeks;
        }
        if (cycle == PlanExecuteFrequency.FIFTEENMINUTE) {
            totalSeconds = 15 minutes;
        }
        return totalSeconds;
    }

    function getPlan(bytes32 pid) external view returns (Plan memory) {
        return plans[pid];
    }

    function createPlan(
        uint256 amount,
        uint256 amountPerTime,
        address token0,
        address token1,
        address recipient,
        PlanExecuteFrequency frequency
    ) external returns (bytes32) {
        require(token0sAvailable[token0], "The token0 is not supported.");
        require(
            amountPerTime >=
                minimumAmountPerTime *
                    (10 ** IERC20Metadata(token0).decimals()),
            "Invalid amountPerTime param."
        );
        require(
            amount >= amountPerTime && amount % amountPerTime == 0,
            "Invalid amount param."
        );
        address from = _msgSender();

        // check token0 approve
        //        require(
        //            IERC20(token0).allowance(from, address(this)) >= amount,
        //            "Approval required"
        //        );

        bytes32 pid = getPID(from, token0, token1, amountPerTime);

        // check duplication
        require(plans[pid].from == address(0), "Duplicated plan.");

        // transfer token0
        TransferHelper.safeTransferFrom(token0, from, address(this), amount);

        // increase token0 total amount
        totalPlanToken0Balance[token0] += amount;

        plans[pid] = Plan({
            from: from,
            token0: token0,
            token1: token1,
            recipient: recipient,
            balance: amount,
            amountPerTime: amountPerTime,
            lastExecuteTimestamp: 0,
            frequency: frequency,
            status: PlanStatus.RUNNING
        });

        // emit event
        emit CreatedPlan(
            pid,
            from,
            token0,
            token1,
            recipient,
            amount,
            amountPerTime,
            frequency
        );

        return pid;
    }

    function fundPlan(bytes32 pid, uint256 amount) external {
        Plan storage plan = plans[pid];
        //        require(plan.from != address(0), "No plans found.");
        require(
            plan.from == _msgSender(),
            "Only the owner of the plan has the permission to fund it."
        );

        require(
            amount >= plan.amountPerTime && amount % plan.amountPerTime == 0,
            "Invalid amount param."
        );

        // transfer token0
        TransferHelper.safeTransferFrom(
            plan.token0,
            _msgSender(),
            address(this),
            amount
        );

        // increase token0 total amount
        totalPlanToken0Balance[plan.token0] += amount;

        plan.balance += amount;

        if (plan.status == PlanStatus.STOPPED) {
            // fund and running
            plan.status = PlanStatus.RUNNING;
        }
        // emit event
        emit FundedPlan(pid, _msgSender(), amount, plan.balance, plan.status);
    }

    function executePlan(
        bytes calldata callData,
        bytes32 pid,
        uint256 amountIn
    ) external nonReentrant onlyRole(EXECUTOR_ROLE) {
        Plan storage plan = plans[pid];
        //        require(
        //            plan.from != address(0),
        //            "No matching plan was found for the given input."
        //        );

        // check status
        require(plan.status == PlanStatus.RUNNING, "The plan is not running.");

        // check time
        if (plan.lastExecuteTimestamp > 0) {
            uint256 duration = block.timestamp - plan.lastExecuteTimestamp;
            uint256 _seconds = _getSeconds(plan.frequency);
            require(duration >= _seconds, "The time has not yet arrived.");
            uint256 diff = duration % _seconds;
            require(diff <= executeTolerance, "Out of plan time range.");
        } else {
            // first execute
        }

        // check calculate amountIn with fee
        uint256 _amountIn = (plan.amountPerTime * (uint256(10000) - fee)) /
            10000;
        require(amountIn == _amountIn, "Invalid amountIn.");

        // check balance
        require(
            plan.balance >= plan.amountPerTime,
            "Insufficient token0 balance."
        );

        // token1 balance
        uint256 token1BalanceBefore = IERC20(plan.token1).balanceOf(
            address(this)
        );

        // approve
        TransferHelper.safeApprove(plan.token0, uniSwapRouter, amountIn);

        (bool success, ) = uniSwapRouter.call(callData);

        require(success, "Call swap failed.");

        // timestamp
        plan.lastExecuteTimestamp = block.timestamp;

        // token0
        plan.balance -= plan.amountPerTime;

        // reduce token0 total amount
        totalPlanToken0Balance[plan.token0] -= plan.amountPerTime;

        uint256 token1BalanceAfter = IERC20(plan.token1).balanceOf(
            address(this)
        );

        uint256 amountOut = token1BalanceAfter - token1BalanceBefore;
        require(amountOut > 0, "Resisting attacks on off-chain swap data.");

        if (plan.recipient == address(0)) {
            // remain token1 in contract
            userToken1Balance[plan.from][plan.token1] += amountOut;
        } else {
            // transfer token1
            TransferHelper.safeTransfer(plan.token1, plan.recipient, amountOut);
        }

        // update status
        if (plan.balance == 0) {
            // insufficient token0 and stop it
            plan.status = PlanStatus.STOPPED;
        }

        // emit event
        emit ExecutedPlan(
            pid,
            _msgSender(),
            plan.token0,
            plan.token1,
            plan.recipient,
            plan.amountPerTime,
            amountOut,
            plan.balance,
            plan.status
        );
    }

    function pausePlan(bytes32 pid) external {
        address from = _msgSender();
        Plan storage plan = plans[pid];

        //        require(plan.from != address(0), "Can not found plan.");
        require(plan.from == from, "You can not pause this plan.");
        require(plan.status == PlanStatus.RUNNING, "The plan is not running.");

        plan.status = PlanStatus.PAUSING;

        // emit event
        emit PausedPlan(pid, from);
    }

    function resumePlan(bytes32 pid) external {
        address from = _msgSender();
        Plan storage plan = plans[pid];

        //        require(plan.from != address(0), "Can not found plan.");
        require(plan.from == from, "You can not resume this plan.");
        require(plan.status == PlanStatus.PAUSING, "The plan is not pausing.");

        plan.status = PlanStatus.RUNNING;

        // emit event
        emit ResumedPlan(pid, from);
    }

    function cancelPlan(bytes32 pid, address recipient) external {
        address from = _msgSender();
        Plan storage plan = plans[pid];

        //        require(plan.from != address(0), "Can not found plan.");
        require(plan.from == from, "You can not cancel this plan.");

        // reduce token0 total amount
        totalPlanToken0Balance[plan.token0] -= plan.balance;

        // transfer
        if (plan.balance > 0) {
            TransferHelper.safeTransfer(plan.token0, recipient, plan.balance);
        }

        // delete
        delete plans[pid];

        // emit event
        emit CanceledPlan(pid, from);
    }

    function withdrawFee(
        address token0,
        address recipient
    ) external onlyRole(ADMIN_ROLE) {
        uint256 availableWithdrawBalance = IERC20(token0).balanceOf(
            address(this)
        ) - totalPlanToken0Balance[token0];
        require(availableWithdrawBalance > 0, "Insufficient token balance");

        // transfer
        TransferHelper.safeTransfer(
            token0,
            recipient,
            availableWithdrawBalance
        );

        // emit event
        emit WithdrawalFee(
            address(this),
            token0,
            recipient,
            availableWithdrawBalance
        );
    }

    function getWithdrawBalance(
        address from,
        address token1
    ) external view returns (uint256) {
        return userToken1Balance[from][token1];
    }

    function withdraw(
        address token1,
        address recipient
    ) external returns (uint256) {
        uint256 balance = userToken1Balance[_msgSender()][token1];
        require(balance > 0, "Insufficient token balance");

        // reset
        userToken1Balance[_msgSender()][token1] = 0;

        // transfer
        TransferHelper.safeTransfer(token1, recipient, balance);

        // emit event
        emit Withdrawal(_msgSender(), token1, recipient, balance);
        return balance;
    }
}
