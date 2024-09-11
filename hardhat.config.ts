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
    //   url: `https://virtual.optimism.rpc.tenderly.co/${process.env.TENDERLY_KEY}`,
    //   chainId: 10,
    //   currency: "VETH",
    // },
    hardhat: {
      forking: {
        // url: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
        url: `${process.env.QUOTE_RPC_URL}`,
        blockNumber: 20703142,
      },
      mining: {
        auto: false,
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
