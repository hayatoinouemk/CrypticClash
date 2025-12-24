import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { CrypticClash, CrypticClash__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("CrypticClash")) as CrypticClash__factory;
  const crypticClash = (await factory.deploy()) as CrypticClash;
  const contractAddress = await crypticClash.getAddress();

  return { crypticClash, contractAddress };
}

describe("CrypticClash", function () {
  let signers: Signers;
  let crypticClash: CrypticClash;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ crypticClash, contractAddress } = await deployFixture());
  });

  it("mints a soldier with encrypted stats and score", async function () {
    const attack = 40;
    const health = 30;
    const defense = 30;

    const encryptedInput = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add32(attack)
      .add32(health)
      .add32(defense)
      .encrypt();

    const tx = await crypticClash
      .connect(signers.alice)
      .mintSoldier(
        encryptedInput.handles[0],
        encryptedInput.handles[1],
        encryptedInput.handles[2],
        encryptedInput.inputProof,
      );
    await tx.wait();

    const tokenId = await crypticClash.getOwnedToken(signers.alice.address);
    expect(tokenId).to.not.eq(0);

    const [attackHandle, healthHandle, defenseHandle] = await crypticClash.getSoldierStats(tokenId);
    const clearAttack = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      attackHandle,
      contractAddress,
      signers.alice,
    );
    const clearHealth = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      healthHandle,
      contractAddress,
      signers.alice,
    );
    const clearDefense = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      defenseHandle,
      contractAddress,
      signers.alice,
    );

    expect(Number(clearAttack)).to.eq(attack);
    expect(Number(clearHealth)).to.eq(health);
    expect(Number(clearDefense)).to.eq(defense);

    const scoreHandle = await crypticClash.getEncryptedScore(tokenId);
    const clearScore = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      scoreHandle,
      contractAddress,
      signers.alice,
    );
    expect(Number(clearScore)).to.eq(0);
  });

  it("attack monster increases encrypted score", async function () {
    const attack = 50;
    const health = 30;
    const defense = 20;
    const healthBonus = Math.floor(health / 10);

    const encryptedInput = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add32(attack)
      .add32(health)
      .add32(defense)
      .encrypt();

    let tx = await crypticClash
      .connect(signers.alice)
      .mintSoldier(
        encryptedInput.handles[0],
        encryptedInput.handles[1],
        encryptedInput.handles[2],
        encryptedInput.inputProof,
      );
    await tx.wait();

    const tokenId = await crypticClash.getOwnedToken(signers.alice.address);
    const scoreHandleBefore = await crypticClash.getEncryptedScore(tokenId);
    const scoreBefore = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      scoreHandleBefore,
      contractAddress,
      signers.alice,
    );

    tx = await crypticClash.connect(signers.alice).attackMonster(tokenId);
    await tx.wait();

    const scoreHandleAfter = await crypticClash.getEncryptedScore(tokenId);
    const scoreAfter = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      scoreHandleAfter,
      contractAddress,
      signers.alice,
    );

    const delta = Number(scoreAfter) - Number(scoreBefore);
    expect([healthBonus + 5, healthBonus + 15]).to.include(delta);
  });
});
