import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { CrypticClash } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("CrypticClashSepolia", function () {
  let signers: Signers;
  let crypticClash: CrypticClash;
  let contractAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const deployment = await deployments.get("CrypticClash");
      contractAddress = deployment.address;
      crypticClash = await ethers.getContractAt("CrypticClash", deployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("mint soldier if needed and decrypt stats", async function () {
    steps = 8;
    this.timeout(4 * 40000);

    const attack = 45;
    const health = 35;
    const defense = 20;

    progress("Checking existing soldier...");
    let tokenId = await crypticClash.getOwnedToken(signers.alice.address);

    if (tokenId === 0n) {
      progress("Encrypting stats...");
      const encryptedInput = await fhevm
        .createEncryptedInput(contractAddress, signers.alice.address)
        .add32(attack)
        .add32(health)
        .add32(defense)
        .encrypt();

      progress("Minting soldier...");
      const tx = await crypticClash
        .connect(signers.alice)
        .mintSoldier(
          encryptedInput.handles[0],
          encryptedInput.handles[1],
          encryptedInput.handles[2],
          encryptedInput.inputProof,
        );
      await tx.wait();

      tokenId = await crypticClash.getOwnedToken(signers.alice.address);
    }

    progress(`Reading soldier stats for token ${tokenId}...`);
    const [attackHandle, healthHandle, defenseHandle] = await crypticClash.getSoldierStats(tokenId);

    progress("Decrypting stats...");
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

    progress(`Attack=${clearAttack} Health=${clearHealth} Defense=${clearDefense}`);
    expect(Number(clearAttack) + Number(clearHealth) + Number(clearDefense)).to.eq(100);
  });
});
