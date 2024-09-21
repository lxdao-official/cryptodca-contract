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

    mapping(bytes32 => Plan) public plans;

    mapping(address => uint256) public totalPlanToken0Balance;

    mapping(address => mapping(address => uint256)) public userToken1Balance;

    // default is 50u
    uint256 private minimumAmountPerTime;
    // default is 5
    uint32 public fee;
    // default is 15 minutes
    uint32 private executeTolerance;
    // swap router address
    address private uniSwapRouter;

    receive() external payable {}

    /**
     * @dev Constructors are replaced by initialize function
     */
    function initialize(InitializeParams calldata params) external {
        minimumAmountPerTime = 50;
        fee = 5;
        executeTolerance = 15 * 60;

        uniSwapRouter = params.uniSwapRouter;

        _grantRole(ADMIN_ROLE, params.admin);

        _setExecutors(params.executors);
    }

    /**
     * @dev Version of the ProjectRegistry contract. Default: "1.0.0"
     */
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

    function getFee() external view returns (uint32) {
        return fee;
    }

    function setFee(uint32 _fee) external onlyRole(ADMIN_ROLE) {
        require(_fee != fee, "Invalid input");
        emit UpdatedFee(_msgSender(), fee, _fee);
        fee = _fee;
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
        require(
            amountPerTime >= minimumAmountPerTime,
            "The amount allocated for each time period should be equal to or greater than the minimum required amount."
        );
        require(
            amount >= amountPerTime && amount % amountPerTime == 0,
            "The total amount should be greater than or equal to the amount per time period and should be a multiple of the amount per time period."
        );
        address from = _msgSender();

        // check token0 approve
        require(
            IERC20(token0).allowance(from, address(this)) >= amount,
            "Approval required"
        );

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
        require(plan.from != address(0), "No plans found.");
        require(
            plan.from == _msgSender(),
            "Only the owner of the plan has the permission to fund it."
        );

        require(
            amount >= plan.amountPerTime && amount % plan.amountPerTime == 0,
            "The added amount should be greater than or equal to the original amount per time period and should be a multiple of the original amount per time period."
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
        address caller,
        bytes calldata callData,
        bytes32 pid,
        uint256 amountIn
    ) external nonReentrant onlyRole(EXECUTOR_ROLE) returns (bool) {
        require(caller == uniSwapRouter, "Caller is wrong.");

        Plan storage plan = plans[pid];
        require(
            plan.from != address(0),
            "No matching plan was found for the given input."
        );

        // check status
        require(plan.status == PlanStatus.RUNNING, "The plan is not running.");

        // check time
        if (plan.lastExecuteTimestamp > 0) {
            uint256 duration = block.timestamp - plan.lastExecuteTimestamp;
            uint256 _seconds = _getSeconds(plan.frequency);
            require(duration >= _seconds, "The time has not yet arrived.");
            uint256 diff = duration % _seconds;
            require(diff <= executeTolerance, "Out of plan time range.");
        }

        // fee
        uint256 _amountIn = (plan.amountPerTime * (uint256(1000) - fee)) / 1000;
        require(amountIn == _amountIn, "Invalid amountIn.");

        // check balance
        require(plan.balance >= amountIn, "Insufficient token0 balance.");

        // token1 balance
        uint256 token1BalanceBefore = IERC20(plan.token1).balanceOf(
            address(this)
        );

        // approve
        TransferHelper.safeApprove(plan.token0, uniSwapRouter, amountIn);

        (bool success, ) = uniSwapRouter.call(callData);
        if (success) {
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
                TransferHelper.safeTransfer(
                    plan.token1,
                    plan.recipient,
                    amountOut
                );
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
        } else {
            // cancel approve
            // TransferHelper.safeApprove(plan.token0, uniSwapRouter, 0);
            revert("Call swap failed");
        }
        return success;
    }

    function pausePlan(bytes32 pid) external {
        address from = _msgSender();
        Plan storage plan = plans[pid];

        require(plan.from != address(0), "Can not found plan.");
        require(plan.from == from, "You can not pause this plan.");
        require(plan.status == PlanStatus.RUNNING, "The plan is not running.");

        plan.status = PlanStatus.PAUSING;

        // emit event
        emit PausedPlan(pid, from);
    }

    function resumePlan(bytes32 pid) external {
        address from = _msgSender();
        Plan storage plan = plans[pid];

        require(plan.from != address(0), "Can not found plan.");
        require(plan.from == from, "You can not result this plan.");
        require(plan.status == PlanStatus.PAUSING, "The plan is not pausing.");

        plan.status = PlanStatus.RUNNING;

        // emit event
        emit ResumedPlan(pid, from);
    }

    function cancelPlan(bytes32 pid, address recipient) external {
        address from = _msgSender();
        Plan storage plan = plans[pid];

        require(plan.from != address(0), "Can not found plan.");
        require(plan.from == from, "You can not cancel this plan.");

        // transfer
        if (plan.balance > 0) {
            TransferHelper.safeTransfer(plan.token0, recipient, plan.balance);
        }

        // reduce token0 total amount
        totalPlanToken0Balance[plan.token0] -= plan.balance;

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

    function withdraw(
        address token1,
        address recipient
    ) external returns (uint256) {
        uint256 availableWithdrawBalance = userToken1Balance[_msgSender()][
            token1
        ];
        require(availableWithdrawBalance > 0, "Insufficient token balance");

        uint256 token1TotalBalance = IERC20(token1).balanceOf(address(this));
        require(
            token1TotalBalance >= availableWithdrawBalance,
            "Wrong token data."
        );

        // transfer
        TransferHelper.safeTransfer(
            token1,
            recipient,
            availableWithdrawBalance
        );

        // emit event
        emit Withdrawal(
            _msgSender(),
            token1,
            recipient,
            availableWithdrawBalance
        );
        return availableWithdrawBalance;
    }
}
