import { ethers, network } from "hardhat";
import { USDT_MAINNET, WBTC_MAINNET } from "../test/utils/token";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import USDT_ABI = require("../test/usdt_abi.json");
import { CryptoDCA } from "../typechain-types";

const admin = "0x716E826C71d4B4EEdBA557Ffa43C888E4d3BB4Fb";
const executor1 = "0xa8ddB004B4D4e66E7CE63FD271453Ac58e4af465";
const executor2 = "0x849e9E0023fB5931459402faAdF84dF9e9656de4";
const executor3 = "0xdf9a887bc323Db91965626A8fF237e5A3bf64A6E";
const recipient = "0xEFe7C1f180B03997D1F3F90e60C28f6bD6007602";
const moneyWallet = "0x70213959A644BaA94840bbfb4129550bceCEB3c2";
const SwapRouter02 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

async function main() {
  const CryptoDCA = await ethers.getContractFactory("CryptoDCA");
  const cryptoDCA = await CryptoDCA.deploy();
  console.log("CryptoDCA Deployed to:", cryptoDCA.address);

  const contract = CryptoDCA.attach(cryptoDCA.address);
  await contract.initialize({
    admin: admin,
    executors: [executor1, executor2, executor3],
    uniSwapRouter: SwapRouter02,
    minimumAmountPerTime: 40,
    fee: 5,
    executeTolerance: 60 * 15,
  });

  await prepare(contract);
}

const prepare = async function prepare(cryptoDCA: CryptoDCA) {
  const provider = ethers.provider;
  const [deployer] = await ethers.getSigners();

  const moneyWalletSigner = await ethers.getSigner(moneyWallet);
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [moneyWallet],
  });

  const recipientSigner = await ethers.getSigner(recipient);
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [recipient],
  });

  await deployer.sendTransaction({
    to: moneyWallet,
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
  await deployer.sendTransaction({
    to: recipient,
    value: ethers.utils.parseEther("10.0"), // Sends exactly 1.0 ether
  });

  const USDT = new ethers.Contract(
    "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    USDT_ABI,
    provider
  );

  const total = ethers.utils.parseUnits("10000", 6);
  await USDT.connect(moneyWalletSigner).transfer(recipient, total);

  // let amount = ethers.utils.parseUnits("1000", 6);
  // let amountPerTime = ethers.utils.parseUnits("25", 6);
  // await USDT.connect(recipientSigner).approve(cryptoDCA.address, amount);
  // await cryptoDCA
  //   .connect(recipientSigner)
  //   .createPlan(
  //     amount,
  //     amountPerTime,
  //     USDT_MAINNET.address,
  //     WBTC_MAINNET.address,
  //     recipient,
  //     8
  //   );
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
