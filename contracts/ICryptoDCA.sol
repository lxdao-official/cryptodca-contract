// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface ICryptoDCA {
    enum PlanStatus {
        RUNNING,
        PAUSING,
        STOPPED
    }

    enum PlanExecuteFrequency {
        ONE_HOUR, // 0
        FOUR_HOURS, // 1
        EIGHT_HOURS, // 2
        TWELVE_HOURS, // 3
        DAILY, // 4
        WEEKLY, // 5
        TWO_WEEK, // 6
        MONTHLY, // 7
        // FOR DEVELOPMENT ONLY
        FIFTEENMINUTE // 8
    }

    struct InitializeParams {
        address admin;
        address[] executors;
        address uniSwapRouter;
        uint256 minimumAmountPerTime;
        uint32 fee;
        uint32 executeTolerance;
        //        address[] availableToken0List;
        //        address[] availableToken1List;
    }

    struct Plan {
        address from;
        address token0;
        address token1;
        address recipient;
        uint256 balance;
        uint256 amountPerTime;
        uint256 lastExecuteTimestamp;
        PlanExecuteFrequency frequency;
        PlanStatus status;
    }

    function initialize(InitializeParams calldata params) external;

    function version() external pure returns (string memory);

    function setExecutors(address[] memory addresses) external;

    function revokeExecutors(address[] memory addresses) external;

    function getPID(
        address from,
        address token0,
        address token1,
        uint256 amountPerTime
    ) external view returns (bytes32);

    function createPlan(
        uint256 amount,
        uint256 amountPerTime,
        address token0,
        address token1,
        address recipient,
        PlanExecuteFrequency frequency
    ) external returns (bytes32 pid);

    function fundPlan(bytes32 pid, uint256 amount) external;

    function executePlan(
        address caller,
        bytes calldata callData,
        bytes32 pid,
        uint256 amountIn
    ) external returns (bool);

    function pausePlan(bytes32 pid) external;

    function resumePlan(bytes32 pid) external;

    function cancelPlan(bytes32 pid, address recipient) external;

    function withdrawFee(address token0, address recipient) external;

    function withdraw(
        address token1,
        address recipient
    ) external returns (uint256);
}
