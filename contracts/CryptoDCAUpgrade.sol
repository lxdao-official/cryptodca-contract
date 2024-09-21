// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract CryptoDCAProxyAdmin is ProxyAdmin {
    constructor(address initialOwner) ProxyAdmin(initialOwner) {}
}

contract CryptoDCAUpgradeableProxy is TransparentUpgradeableProxy {
    constructor(
        address _logic,
        address _admin,
        bytes memory _data
    ) TransparentUpgradeableProxy(_logic, _admin, _data) {}
}
