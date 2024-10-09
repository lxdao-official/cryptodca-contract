// import {
//   time,
//   loadFixture,
// } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  loadFixture,
  time,
  mine,
} from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import {
  Currency,
  CurrencyAmount as CurrencyAmountRaw,
  Token,
  ChainId,
  TradeType,
  Percent,
} from "@uniswap/sdk-core";
import { Protocol } from "@uniswap/router-sdk";
import JSBI from "jsbi";

import {
  AlphaRouter,
  SwapOptionsSwapRouter02,
  SwapType,
  AlphaRouterConfig,
} from "@uniswap/smart-order-router";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import USDT_ABI = require("./usdt_abi.json");
import USDC_ABI = require("./usdc_abi.json");
import WETH_ABI = require("./weth_abi.json");
import WBTC_ABI = require("./wbtc_abi.json");

import { fromReadableAmount } from "./utils/conversion";
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from "./utils/config";
import { zeroAddress } from "ethereumjs-util";
import { BigNumber } from "ethers";
import {
  USDC_MAINNET,
  USDT_MAINNET,
  WBTC_MAINNET,
  WETH_MAINNET,
} from "./utils/token";

class CurrencyAmount extends CurrencyAmountRaw<Currency> {}

function parseAmount(value: string, currency: Currency): CurrencyAmount {
  const typedValueParsed = ethers.utils
    .parseUnits(value, currency.decimals)
    .toString();
  return CurrencyAmount.fromRawAmount(currency, JSBI.BigInt(typedValueParsed));
}

const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const ADMIN_ROLE = ethers.utils.id("ADMIN");
const EXECUTOR_ROLE = ethers.utils.id("EXECUTOR");

describe("CryptoDCA", function () {
  const SwapRouter02 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
  let alphaRouter: AlphaRouter;

  const realWallet = "0x70213959A644BaA94840bbfb4129550bceCEB3c2";

  const provider1 = new ethers.providers.JsonRpcProvider(
    process.env.ALCHEMY_RPC_URL
  );
  const provider = ethers.provider;

  const USDT = new ethers.Contract(USDT_MAINNET.address, USDT_ABI, provider);

  const USDC = new ethers.Contract(USDC_MAINNET.address, USDC_ABI, provider);

  const WETH = new ethers.Contract(WETH_MAINNET.address, WETH_ABI, provider);

  const WBTC = new ethers.Contract(WBTC_MAINNET.address, WBTC_ABI, provider);

  async function deployFixture() {
    const [_, admin, executor1, executor2, executor3, recipient] =
      await ethers.getSigners();

    alphaRouter = new AlphaRouter({
      chainId: ChainId.MAINNET,
      provider: provider1,
    });

    const realWalletSigner = await ethers.getSigner(realWallet);
    {
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [realWallet],
      });
      await admin.sendTransaction({
        to: realWallet,
        value: ethers.utils.parseEther("10.0"), // Sends exactly 1.0 ether
      });
      // await network.provider.send("hardhat_setBalance", [
      //   realWallet,
      //   "0x1000",
      // ]);
      // await hre.network.provider.send("hardhat_setNonce", [realWallet, "0x21"]);
    }

    const CryptoDCA = await ethers.getContractFactory("CryptoDCA");

    const cryptoDCA = await CryptoDCA.deploy();

    const CryptoDCAProxyAdmin = await ethers.getContractFactory(
      "CryptoDCAProxyAdmin"
    );
    const cryptoDCAAdmin = await CryptoDCAProxyAdmin.deploy(admin.address);

    const upgradeableFactory = await ethers.getContractFactory(
      "CryptoDCAUpgradeableProxy"
    );
    const proxy = await upgradeableFactory.deploy(
      cryptoDCA.address,
      cryptoDCAAdmin.address,
      Buffer.from("")
    );
    const contract = CryptoDCA.attach(proxy.address);
    await contract.initialize({
      admin: admin.address,
      executors: [executor1.address, executor2.address, executor3.address],
      uniSwapRouter: SwapRouter02,
      availableToken0List: [USDT_MAINNET.address, USDC_MAINNET.address],
    });

    return {
      cryptoDCA: contract,
      realWalletSigner,
      admin,
      executor1,
      executor2,
      executor3,
      recipient,
    };
  }

  describe("Fork Chain Test", function () {
    it("Balance", async function () {
      const { cryptoDCA, realWalletSigner, admin } = await loadFixture(
        deployFixture
      );

      const blockNumber = await ethers.provider.getBlockNumber();
      console.log("block blockNumber:", blockNumber);
      const block = await ethers.provider.getBlock(blockNumber);
      console.log("block timestamp:", block?.timestamp);

      const ethBalance = await ethers.provider.getBalance(
        realWalletSigner.getAddress()
      );
      console.log("ETH balance:", ethers.utils.formatUnits(ethBalance));

      const usdcBalance = await USDC.balanceOf(realWalletSigner.getAddress());
      console.log("USDC balance:", ethers.utils.formatUnits(usdcBalance, 6));
    });
  });

  describe("Plan", async function () {
    it("Create, Fee, Role, ExecuteTolerance, AvailableToken0List", async function () {
      const {
        cryptoDCA,
        realWalletSigner,
        recipient,
        admin,
        executor1,
        executor2,
        executor3,
      } = await loadFixture(deployFixture);

      expect(await cryptoDCA.version()).to.equal("1.0.0");

      const token0 = USDT_MAINNET;
      const token1 = WETH_MAINNET;
      let amount = ethers.utils.parseUnits("1000", token0.decimals);
      let amountPerTime = ethers.utils.parseUnits("50", token0.decimals);

      // create
      await USDT.connect(realWalletSigner).approve(cryptoDCA.address, amount);
      await cryptoDCA
        .connect(realWalletSigner)
        .createPlan(
          amount,
          amountPerTime,
          token0.address,
          token1.address,
          recipient.address,
          8
        );

      // Fee
      expect(await cryptoDCA.getFee()).to.equal(5);
      await cryptoDCA.connect(admin).setFee(10);
      expect(await cryptoDCA.getFee()).to.equal(10);

      // Role
      expect(await cryptoDCA.hasRole(ADMIN_ROLE, admin.address)).to.equal(true);
      expect(
        await cryptoDCA.hasRole(EXECUTOR_ROLE, executor1.address)
      ).to.equal(true);
      expect(
        await cryptoDCA.hasRole(EXECUTOR_ROLE, executor2.address)
      ).to.equal(true);
      expect(
        await cryptoDCA.hasRole(EXECUTOR_ROLE, executor3.address)
      ).to.equal(true);

      // ExecuteTolerance
      expect(await cryptoDCA.getExecuteTolerance()).to.equal(15 * 60);
      await cryptoDCA.connect(admin).setExecuteTolerance(20 * 60);
      expect(await cryptoDCA.getExecuteTolerance()).to.equal(20 * 60);

      // AvailableToken0List
      expect(await cryptoDCA.isToken0Available(USDT_MAINNET.address)).to.equal(
        true
      );
      expect(await cryptoDCA.isToken0Available(WBTC_MAINNET.address)).to.equal(
        false
      );
    });

    it("Create, Fund, Pause, Resume, Cancel", async function () {
      //*
      const { cryptoDCA, realWalletSigner, recipient } = await loadFixture(
        deployFixture
      );

      const token0 = USDT_MAINNET;
      const token1 = WETH_MAINNET;
      let amount = ethers.utils.parseUnits("100", token0.decimals);
      let amountPerTime = ethers.utils.parseUnits("50", token0.decimals);

      const pid = await cryptoDCA.getPID(
        realWalletSigner.address,
        token0.address,
        token1.address,
        amountPerTime
      );

      // create
      await USDT.connect(realWalletSigner).approve(cryptoDCA.address, amount);
      await cryptoDCA
        .connect(realWalletSigner)
        .createPlan(
          amount,
          amountPerTime,
          token0.address,
          token1.address,
          recipient.address,
          8
        );
      let plan = await cryptoDCA.getPlan(pid);
      expect(plan.from).to.equal(realWalletSigner.address);
      expect(plan.balance).to.equal(amount);

      // fund
      let fund = ethers.utils.parseUnits("100", token0.decimals);
      await USDT.connect(realWalletSigner).approve(cryptoDCA.address, fund);
      await cryptoDCA.connect(realWalletSigner).fundPlan(pid, fund);
      plan = await cryptoDCA.getPlan(pid);
      expect(plan.balance).to.equal(amount.add(fund));

      // pause
      await cryptoDCA.connect(realWalletSigner).pausePlan(pid);
      plan = await cryptoDCA.getPlan(pid);
      expect(plan.status).to.equal(1);

      // resume
      await cryptoDCA.connect(realWalletSigner).resumePlan(pid);
      plan = await cryptoDCA.getPlan(pid);
      expect(plan.status).to.equal(0);

      // cancel
      await cryptoDCA
        .connect(realWalletSigner)
        .cancelPlan(pid, realWalletSigner.address);

      plan = await cryptoDCA.getPlan(pid);
      expect(plan.from).to.equal(zeroAddress());
      // */
    });

    it("Execute, Withdraw", async function () {
      //*
      const {
        cryptoDCA,
        realWalletSigner,
        executor1,
        executor2,
        recipient,
        admin,
      } = await loadFixture(deployFixture);

      const token0 = USDT_MAINNET;
      const token1 = WBTC_MAINNET;

      const finalRecipient = recipient.address;
      // const finalRecipient = zeroAddress();

      let recipientToken1Balance: BigNumber = BigNumber.from(0);
      if (finalRecipient != zeroAddress()) {
        recipientToken1Balance = await WBTC.balanceOf(finalRecipient);
      }

      const amountPerTimeStr = "50";
      let amount = ethers.utils.parseUnits("100", token0.decimals);
      let amountPerTime = ethers.utils.parseUnits(
        amountPerTimeStr,
        token0.decimals
      );

      await USDT.connect(realWalletSigner).approve(cryptoDCA.address, amount);
      await cryptoDCA
        .connect(realWalletSigner)
        .createPlan(
          amount,
          amountPerTime,
          token0.address,
          token1.address,
          finalRecipient,
          8
        );

      const fee = await cryptoDCA.getFee();
      const _amountIn = parseAmount(amountPerTimeStr, token0);
      const amountIn = _amountIn.multiply(1000 - fee).divide(1000);
      let amountOut = ethers.utils.parseUnits(
        amountIn.toExact(),
        token0.decimals
      );

      const _amountFee = _amountIn.subtract(amountIn);
      const amountFee = ethers.utils.parseUnits(
        _amountFee.toExact(),
        token0.decimals
      );
      let amountFeeAmount = BigNumber.from(0);

      const pid = await cryptoDCA.getPID(
        realWalletSigner.address,
        token0.address,
        token1.address,
        amountPerTime
      );

      const options: SwapOptionsSwapRouter02 = {
        recipient: cryptoDCA.address,
        slippageTolerance: new Percent(150, 10_000),
        deadline: Math.floor(Date.now() / 1000 + 1800),
        type: SwapType.SWAP_ROUTER_02,
      };
      const ROUTING_CONFIG: AlphaRouterConfig = {
        // @ts-ignore[TS7053] - complaining about switch being non exhaustive
        ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[ChainId.MAINNET],
        protocols: [Protocol.V3, Protocol.V2],
      };
      const route = await alphaRouter.route(
        amountIn,
        token1,
        TradeType.EXACT_INPUT,
        options,
        {
          ...ROUTING_CONFIG,
        }
      );

      if (route != null) {
        // execute
        await cryptoDCA
          .connect(executor1)
          .executePlan(route.methodParameters?.calldata, pid, amountOut);
        amountFeeAmount = amountFeeAmount.add(amountFee);

        {
          const plan = await cryptoDCA.getPlan(pid);
          expect(plan.balance).to.be.equal(amount.sub(amountPerTime));
        }

        await time.increase(15 * 60);

        // execute
        await cryptoDCA
          .connect(executor2)
          .executePlan(route.methodParameters?.calldata, pid, amountOut);
        amountFeeAmount = amountFeeAmount.add(amountFee);

        {
          const plan = await cryptoDCA.getPlan(pid);
          expect(plan.balance).to.be.equal(
            amount.sub(amountPerTime).sub(amountPerTime)
          );
          expect(plan.status).to.equal(2);
        }

        // fund
        let fund = ethers.utils.parseUnits("50", token0.decimals);
        await USDT.connect(realWalletSigner).approve(cryptoDCA.address, fund);
        await cryptoDCA.connect(realWalletSigner).fundPlan(pid, fund);
        {
          const plan = await cryptoDCA.getPlan(pid);
          expect(plan.balance).to.be.equal(fund);
          expect(plan.status).to.equal(0);
        }

        // withdraw or no
        if (finalRecipient == zeroAddress()) {
          const balance1: BigNumber = await WBTC.balanceOf(cryptoDCA.address);
          const balance2: BigNumber = await WBTC.balanceOf(
            realWalletSigner.address
          );
          await cryptoDCA
            .connect(realWalletSigner)
            .withdraw(token1.address, realWalletSigner.address);
          const balance3: BigNumber = await WBTC.balanceOf(
            realWalletSigner.address
          );
          expect(balance1.add(balance2)).to.equal(balance3);
        } else {
          const balance: BigNumber = await WBTC.balanceOf(finalRecipient);
          expect(balance).to.greaterThan(recipientToken1Balance);
        }

        // withdraw fee
        const balance1: BigNumber = await USDT.balanceOf(recipient.address);
        await cryptoDCA
          .connect(admin)
          .withdrawFee(token0.address, recipient.address);
        const balance2: BigNumber = await USDT.balanceOf(recipient.address);
        expect(balance1.add(amountFeeAmount)).to.equal(balance2);
      }
      // */
    });
  });
});
