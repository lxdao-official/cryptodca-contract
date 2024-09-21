import { ethers, network } from "hardhat";
import {
  USDC_MAINNET,
  USDT_MAINNET,
  WBTC_MAINNET,
  WETH_MAINNET,
} from "../test/utils/token";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import USDT_ABI = require("../test/usdt_abi.json");
import USDC_ABI = require("../test/usdc_abi.json");
import { CryptoDCA } from "../typechain-types";
import { BigNumber } from "ethers";

const admin = "0x716E826C71d4B4EEdBA557Ffa43C888E4d3BB4Fb";
const executor1 = "0xa8ddB004B4D4e66E7CE63FD271453Ac58e4af465";
const executor2 = "0x849e9E0023fB5931459402faAdF84dF9e9656de4";
const executor3 = "0xdf9a887bc323Db91965626A8fF237e5A3bf64A6E";
const SwapRouter02 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

const USDTWallet = "0x70213959A644BaA94840bbfb4129550bceCEB3c2";
const USDCWallet = "0x4B16c5dE96EB2117bBE5fd171E4d203624B014aa";

const recipient = "0xEFe7C1f180B03997D1F3F90e60C28f6bD6007602";

async function main() {
  const CryptoDCA = await ethers.getContractFactory("CryptoDCA");
  const cryptoDCA = await CryptoDCA.deploy();
  console.log("CryptoDCA Deployed to:", cryptoDCA.address);

  const CryptoDCAProxyAdmin = await ethers.getContractFactory(
    "CryptoDCAProxyAdmin"
  );
  const cryptoDCAAdmin = await CryptoDCAProxyAdmin.deploy(admin);
  console.log("CryptoDCA Admin Deployed to:", cryptoDCAAdmin.address);

  const upgradeableFactory = await ethers.getContractFactory(
    "CryptoDCAUpgradeableProxy"
  );
  const proxy = await upgradeableFactory.deploy(
    cryptoDCA.address,
    cryptoDCAAdmin.address,
    Buffer.from("")
  );
  console.log("CryptoDCA Proxy Deployed to:", proxy.address);

  const contract = CryptoDCA.attach(proxy.address);
  await contract.initialize({
    admin: admin,
    executors: [executor1, executor2, executor3],
    uniSwapRouter: SwapRouter02,
  });

  await prepare();

  // await transferToken("0x41C7164970B70e9D6A22cB20c5Cb40AB378206DA");
  // await transferToken("0xF4192Be0b579be42A3479974EC25592DeFfe7141");
  // await transferToken("0x36a78936c69dE7f41773B99652c3f6977c0d7A83");
  // await transferToken(recipient);
  // await transferToken("0xc8a84Ee3CD9fac77555bf8e6EC9aA778ee7F6a21");

  await createPlan(contract);
}

const prepare = async function () {
  const [deployer] = await ethers.getSigners();

  await deployer.sendTransaction({
    to: USDTWallet,
    value: ethers.utils.parseEther("10.0"), // Sends exactly 1.0 ether
  });
  await deployer.sendTransaction({
    to: USDCWallet,
    value: ethers.utils.parseEther("10.0"), // Sends exactly 1.0 ether
  });
  await deployer.sendTransaction({
    to: admin,
    value: ethers.utils.parseEther("10.0"), // Sends exactly 1.0 ether
  });
  await deployer.sendTransaction({
    to: executor1,
    value: ethers.utils.parseEther("10.0"), // Sends exactly 1.0 ether
  });
  await deployer.sendTransaction({
    to: executor2,
    value: ethers.utils.parseEther("10.0"), // Sends exactly 1.0 ether
  });
  await deployer.sendTransaction({
    to: executor3,
    value: ethers.utils.parseEther("10.0"), // Sends exactly 1.0 ether
  });
};

const transferToken = async function (wallet: string) {
  const provider = ethers.provider;
  const [deployer] = await ethers.getSigners();

  await deployer.sendTransaction({
    to: wallet,
    value: ethers.utils.parseEther("10.0"), // Sends exactly 1.0 ether
  });

  const USDT = new ethers.Contract(
    "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    USDT_ABI,
    provider
  );

  const USDC = new ethers.Contract(
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDC_ABI,
    provider
  );

  const USDTWalletSigner = await ethers.getSigner(USDTWallet);
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [USDTWallet],
  });

  const USDCWalletSigner = await ethers.getSigner(USDCWallet);
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [USDCWallet],
  });

  const total1 = ethers.utils.parseUnits("10000", 6);
  await USDT.connect(USDTWalletSigner).transfer(wallet, total1);

  const total2 = ethers.utils.parseUnits("10000", 6);
  await USDC.connect(USDCWalletSigner).transfer(wallet, total2);
};

const createPlan = async function (cryptoDCA: CryptoDCA) {
  const provider = ethers.provider;

  const recipientSigner = await ethers.getSigner(recipient);
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [recipient],
  });

  const USDT = new ethers.Contract(
    "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    USDT_ABI,
    provider
  );

  const USDC = new ethers.Contract(
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDC_ABI,
    provider
  );

  {
    let amount = ethers.utils.parseUnits("1000", 6);
    let amountPerTime = ethers.utils.parseUnits("25", 6);
    await USDT.connect(recipientSigner).approve(cryptoDCA.address, amount);
    await cryptoDCA
      .connect(recipientSigner)
      .createPlan(
        amount,
        amountPerTime,
        USDT_MAINNET.address,
        WBTC_MAINNET.address,
        recipient,
        8
      );
  }

  {
    let amount = ethers.utils.parseUnits("1025", 6);
    let amountPerTime = ethers.utils.parseUnits("25", 6);
    await USDC.connect(recipientSigner).approve(cryptoDCA.address, amount);
    await cryptoDCA
      .connect(recipientSigner)
      .createPlan(
        amount,
        amountPerTime,
        USDC_MAINNET.address,
        WETH_MAINNET.address,
        recipient,
        8
      );
  }
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
