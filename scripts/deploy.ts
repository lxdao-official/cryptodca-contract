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
    availableToken0List: [USDT_MAINNET.address, USDC_MAINNET.address],
  });

  await prepare();

  await transferToken(recipient);
  await createPlan(contract);

  // transferToken
  const walletList = [
    "0x41C7164970B70e9D6A22cB20c5Cb40AB378206DA",
    "0xF4192Be0b579be42A3479974EC25592DeFfe7141",
    "0x36a78936c69dE7f41773B99652c3f6977c0d7A83",
    "0xc8a84Ee3CD9fac77555bf8e6EC9aA778ee7F6a21",
    "0xdcdbbe2c2c7fcd828794810548ebe4f629d2f54f",
    "0xC30559a69C2654cdB7F1e04200037F026D941313",
    "0x999E136C7575396bAD7ED1c726042908A43f666C",
    "0xb3e98752b6c707020d0ed7c952aa68d5493b3e35",
    "0x4b0B9B732814c501eD3480aa4bea96b1e719550E",
    "0xd170dB79Aea48c921DB08C6408d6E46B125FBA53",
    "0x4166acb87c49e7630f9053b0be6e990b8fa8783c",
    "0xA0d0219d413B36113F90330d7575CFb047a08979",
    "0x5d2abDbcc951D39531eC0Ae5fc6b438D516d2Fe6",
    "0xd2b0f7bDD519E59F5aEA6F7382F5d5E59B3FE18f",
    "0x016df27C5a9e479AB01e3053CD5a1967f96eCD6E",
    "0x84EFC8925c4Fd657759DAc68E4e37701E1793653",
    "0xBBc1fE874422F61fB135e72C3229Fffc3Cb266Fb",
    "0x8873a9637Ea7A654b6991B5B09549104698eCf5F",
    "0x0285c107657c454B651d0E9C1ddd5da8116Da45C",
    "0x86DBe1f56dC3053b26522de1B38289E39AFCF884",
    "0x8a185375a3FF98C94Dd7D3ff26eEDCAdbc2Ec1D9",
    "0x746D95C73D2DBD1f27F8AB4eb64391760099FA7A",
    "0xc841d6ddf66467af551b35218c0c2e22f9c14b48",
    "0x1d41D6B1091C1a8A334096771bd1776019243d5e",
    "0x36ffACB532B39553c6ae9188018e9eF8e0f6C051",
    "0xCbDCA37ca62617AECCB12F4D64969f6544F0374e",
    "0x4c75667C4251Cc782f51E5077e996F72682B3043",
    "0xd8412C800C092cB2F8Df60774393F8729A7aed10",
  ];
  for (let i = 0; i < walletList.length; i++) {
    await transferToken(walletList[i]);
  }
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

  const total1 = ethers.utils.parseUnits("20000", 6);
  await USDT.connect(USDTWalletSigner).transfer(wallet, total1);

  const total2 = ethers.utils.parseUnits("20000", 6);
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
    let amountPerTime = ethers.utils.parseUnits("50", 6);
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
    let amount = ethers.utils.parseUnits("10500", 6);
    let amountPerTime = ethers.utils.parseUnits("500", 6);
    await USDT.connect(recipientSigner).approve(cryptoDCA.address, amount);
    await cryptoDCA
      .connect(recipientSigner)
      .createPlan(
        amount,
        amountPerTime,
        USDT_MAINNET.address,
        WETH_MAINNET.address,
        recipient,
        8
      );
  }

  {
    let amount = ethers.utils.parseUnits("4260", 6);
    let amountPerTime = ethers.utils.parseUnits("60", 6);
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

  {
    let amount = ethers.utils.parseUnits("2100", 6);
    let amountPerTime = ethers.utils.parseUnits("300", 6);
    await USDC.connect(recipientSigner).approve(cryptoDCA.address, amount);
    await cryptoDCA
      .connect(recipientSigner)
      .createPlan(
        amount,
        amountPerTime,
        USDC_MAINNET.address,
        WBTC_MAINNET.address,
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
