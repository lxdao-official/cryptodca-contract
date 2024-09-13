import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
// import "@openzeppelin/hardhat-upgrades";
import "dotenv/config";
require("dotenv").config();

// import * as tenderly from "@tenderly/hardhat-tenderly";
// tenderly.setup({ automaticVerifications: true });

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    // virtual_optimistic_ethereum: {
    //   url: `${process.env.TENDERLY_RPC_URL}`,
    //   chainId: 1,
    //   currency: "ETH",
    // },
    hardhat: {
      forking: {
        url: `${process.env.ALCHEMY_RPC_URL}`,
      },
      mining: {
        auto: true,
        interval: 13000,
      },
    },
  },
  // tenderly: {
  //   project: "usedefi",
  //   username: "KahnYuan001",
  // },
};

export default config;
