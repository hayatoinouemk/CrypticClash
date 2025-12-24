# CrypticClash

CrypticClash is a privacy-first, on-chain mini game built with Zama FHEVM. Players mint a Soldier with encrypted stats,
then battle monsters to earn encrypted score. The game keeps sensitive attributes private while still enforcing rules
directly on-chain.

## Project goals

- Prove that a fully on-chain game can keep player stats private without off-chain trusts.
- Make encrypted gameplay easy to understand for users and developers.
- Provide a compact Hardhat + React reference for Zama FHEVM projects.

## Problems this project solves

- **On-chain stat leakage**: Typical RPG or strategy games expose attributes and builds. CrypticClash stores stats as FHE
  encrypted values so they remain private on-chain.
- **Fair rule enforcement**: Stat allocation is validated on-chain with encrypted arithmetic, so players cannot exceed the
  100-point budget.
- **Private scoring**: Player score is encrypted, preserving competitive secrecy while still awarding deterministic
  rewards.

## Advantages

- **Privacy by default**: Attack, health, defense, and score are encrypted `euint32` values on-chain.
- **Trust-minimized**: Rules are enforced inside the contract using FHE operations.
- **Simple mental model**: One Soldier per wallet, clear stat budget, deterministic reward formula.
- **Lightweight stack**: Hardhat for contracts, React + Vite for the UI, viem for reads and ethers for writes.
- **Auditable**: Minimal contract surface area and explicit events for minting and battles.

## Core features

- Mint a Soldier with encrypted stats (attack, health, defense).
- Enforce that the stat total equals exactly 100.
- Attack monsters to earn encrypted score.
- Decrypt stats and score only for the owner.
- Track ownership and events for game actions.

## How the game works

1. The user chooses how to split 100 points among attack, health, and defense.
2. The frontend encrypts the inputs and submits them with a proof.
3. The contract validates the encrypted sum and mints a Soldier if valid.
4. Monster battles compare encrypted total power against encrypted monster power.
5. Rewards are computed on-chain and accumulated into encrypted score.
6. The owner can request decryption of their stats and score.

## Smart contract details

- **Contract**: `contracts/CrypticClash.sol`
- **Single Soldier per address**: Each wallet can mint one Soldier.
- **Not a full ERC-721**: Ownership is tracked internally for a minimal game loop; transfers are not implemented.
- **Encrypted stats**: Stored as `euint32` in `SoldierStats`.
- **Encrypted score**: Stored as `euint32`, updated per battle.
- **Rewards**:
  - Base win reward: `BASE_WIN_REWARD` (15)
  - Base loss reward: `BASE_LOSS_REWARD` (5)
  - Health bonus: `health / 10`
- **Privacy controls**: The contract explicitly allows the owner to decrypt their stats and score.

## Encrypted data flow

- **Inputs**: Stats are encrypted client-side and sent as `externalEuint32` with a proof.
- **Validation**: The contract checks the encrypted sum equals 100.
- **Storage**: Encrypted values are stored on-chain without revealing plaintext.
- **Access control**: `FHE.allow` grants the owner decryption rights.
- **Decryption**: The frontend requests decryption via the Zama relayer workflow.

## Frontend architecture

- **UI**: React + Vite (no Tailwind).
- **Wallet**: RainbowKit for wallet connection.
- **Reads**: viem for contract reads.
- **Writes**: ethers for contract transactions.
- **Network**: Configured for Sepolia in `app/src/config/wagmi.ts`.
- **Contract config**: `app/src/config/contracts.ts` holds the deployed address and ABI.

## Tech stack

- **Smart contracts**: Solidity 0.8.27, Zama FHEVM, Hardhat, hardhat-deploy
- **Testing**: Hardhat test runner, chai matchers
- **Frontend**: React, Vite, TypeScript
- **Web3**: viem (reads), ethers (writes), RainbowKit + wagmi

## Repository structure

```
contracts/              # Smart contracts
deploy/                 # Deployment scripts
tasks/                  # Hardhat tasks
test/                   # Hardhat tests
app/                    # React frontend
```

## Prerequisites

- **Node.js**: 20+
- **npm**: Package manager
- **Infura API key**: For Sepolia deployments
- **Private key**: For deployment (no mnemonic)

## Environment setup

Create a `.env` file in the repo root with:

```
PRIVATE_KEY=your_private_key_without_0x
INFURA_API_KEY=your_infura_key
ETHERSCAN_API_KEY=optional_for_verification
```

## Install dependencies

```
npm install
```

## Compile contracts

```
npm run compile
```

## Run tests

```
npm run test
```

## Deploy locally (contracts only)

```
npx hardhat node
npx hardhat deploy --network localhost
```

## Deploy to Sepolia

```
npx hardhat deploy --network sepolia
```

If you want to verify:

```
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

## Frontend setup

From `app/`:

```
npm install
npm run dev
```

### Frontend configuration checklist

- Update `app/src/config/wagmi.ts` with your RainbowKit project ID.
- After deployment, copy the ABI from `deployments/sepolia` into
  `app/src/config/contracts.ts` (do not import JSON).
- Replace `CONTRACT_ADDRESS` in `app/src/config/contracts.ts` with the deployed address.

## User flow

1. Connect wallet on Sepolia.
2. Allocate 100 stat points across attack, health, and defense.
3. Mint your Soldier (encrypted stats are stored on-chain).
4. View encrypted stats and score.
5. Request decryption to see plaintext values.
6. Attack monsters to earn encrypted points.

## Security and privacy notes

- Encrypted values are never stored in plaintext on-chain.
- Only the owner is allowed to decrypt their stats and score.
- Combat randomness uses FHEVM-provided randomness.
- This project is a demo and has not been audited.

## Limitations

- No transfers or approvals; Soldiers are bound to the minter.
- One Soldier per address.
- No metadata URIs or token enumeration.
- Gameplay is intentionally minimal to highlight encrypted mechanics.

## Future roadmap

- Add multiple Soldiers per wallet with indexed inventory.
- Implement ERC-721 compatibility with transfers and metadata.
- Expand combat mechanics with encrypted buffs and debuffs.
- Add encrypted leaderboards and seasonal rewards.
- Improve UX around decryption status and progress.
- Add event indexing for faster frontend updates.

## License

BSD-3-Clause-Clear. See `LICENSE`.
