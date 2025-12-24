import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedCrypticClash = await deploy("CrypticClash", {
    from: deployer,
    log: true,
  });

  console.log(`CrypticClash contract: `, deployedCrypticClash.address);
};
export default func;
func.id = "deploy_cryptic_clash"; // id required to prevent reexecution
func.tags = ["CrypticClash"];
