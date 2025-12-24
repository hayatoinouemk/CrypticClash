import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:address", "Prints the CrypticClash address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;
  const crypticClash = await deployments.get("CrypticClash");
  console.log("CrypticClash address is " + crypticClash.address);
});

task("task:mint-soldier", "Mints a Soldier NFT with encrypted stats")
  .addOptionalParam("address", "Optionally specify the CrypticClash contract address")
  .addParam("attack", "Attack points")
  .addParam("health", "Health points")
  .addParam("defense", "Defense points")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const attack = parseInt(taskArguments.attack);
    const health = parseInt(taskArguments.health);
    const defense = parseInt(taskArguments.defense);
    if (![attack, health, defense].every(Number.isInteger)) {
      throw new Error(`Stats must be integers`);
    }

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("CrypticClash");
    const signers = await ethers.getSigners();
    const contract = await ethers.getContractAt("CrypticClash", deployment.address);

    const encryptedInput = await fhevm
      .createEncryptedInput(deployment.address, signers[0].address)
      .add32(attack)
      .add32(health)
      .add32(defense)
      .encrypt();

    const tx = await contract
      .connect(signers[0])
      .mintSoldier(encryptedInput.handles[0], encryptedInput.handles[1], encryptedInput.handles[2], encryptedInput.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();
    console.log("Soldier minted successfully.");
  });

task("task:attack", "Attacks a monster with a Soldier NFT")
  .addOptionalParam("address", "Optionally specify the CrypticClash contract address")
  .addParam("tokenId", "Soldier token ID")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const tokenId = BigInt(taskArguments.tokenId);

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("CrypticClash");
    const signers = await ethers.getSigners();
    const contract = await ethers.getContractAt("CrypticClash", deployment.address);

    const tx = await contract.connect(signers[0]).attackMonster(tokenId);
    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();
    console.log("Monster attacked.");
  });

task("task:decrypt-stats", "Decrypts Soldier stats for the caller")
  .addOptionalParam("address", "Optionally specify the CrypticClash contract address")
  .addParam("tokenId", "Soldier token ID")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("CrypticClash");
    const signers = await ethers.getSigners();
    const contract = await ethers.getContractAt("CrypticClash", deployment.address);

    const tokenId = BigInt(taskArguments.tokenId);
    const [attackHandle, healthHandle, defenseHandle] = await contract.getSoldierStats(tokenId);

    const attack = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      attackHandle,
      deployment.address,
      signers[0],
    );
    const health = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      healthHandle,
      deployment.address,
      signers[0],
    );
    const defense = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      defenseHandle,
      deployment.address,
      signers[0],
    );

    console.log(`Attack : ${attack}`);
    console.log(`Health : ${health}`);
    console.log(`Defense: ${defense}`);
  });

task("task:decrypt-score", "Decrypts Soldier score for the caller")
  .addOptionalParam("address", "Optionally specify the CrypticClash contract address")
  .addParam("tokenId", "Soldier token ID")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("CrypticClash");
    const signers = await ethers.getSigners();
    const contract = await ethers.getContractAt("CrypticClash", deployment.address);

    const tokenId = BigInt(taskArguments.tokenId);
    const scoreHandle = await contract.getEncryptedScore(tokenId);

    const score = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      scoreHandle,
      deployment.address,
      signers[0],
    );

    console.log(`Score: ${score}`);
  });
