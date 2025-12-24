// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title CrypticClash Soldier NFT
/// @notice Mint one encrypted soldier and fight monsters for encrypted score.
contract CrypticClash is ZamaEthereumConfig {
    struct SoldierStats {
        euint32 attack;
        euint32 health;
        euint32 defense;
    }

    string public constant name = "CrypticClash Soldier";
    string public constant symbol = "CCS";
    uint32 public constant STAT_POINTS = 100;
    uint32 public constant BASE_WIN_REWARD = 15;
    uint32 public constant BASE_LOSS_REWARD = 5;

    uint256 private _nextTokenId = 1;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _ownedToken;
    mapping(uint256 => SoldierStats) private _soldiers;
    mapping(uint256 => euint32) private _scores;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event SoldierMinted(address indexed owner, uint256 indexed tokenId);
    event MonsterAttacked(address indexed owner, uint256 indexed tokenId);

    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "Invalid owner");
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "Token does not exist");
        return owner;
    }

    function getOwnedToken(address owner) external view returns (uint256) {
        return _ownedToken[owner];
    }

    function hasSoldier(address owner) external view returns (bool) {
        return _ownedToken[owner] != 0;
    }

    function getSoldierStats(uint256 tokenId)
        external
        view
        returns (euint32 attack, euint32 health, euint32 defense)
    {
        SoldierStats storage stats = _soldiers[tokenId];
        return (stats.attack, stats.health, stats.defense);
    }

    function getEncryptedScore(uint256 tokenId) external view returns (euint32) {
        return _scores[tokenId];
    }

    function mintSoldier(
        externalEuint32 attackInput,
        externalEuint32 healthInput,
        externalEuint32 defenseInput,
        bytes calldata inputProof
    ) external {
        require(_ownedToken[msg.sender] == 0, "Soldier already minted");

        euint32 attack = FHE.fromExternal(attackInput, inputProof);
        euint32 health = FHE.fromExternal(healthInput, inputProof);
        euint32 defense = FHE.fromExternal(defenseInput, inputProof);

        euint32 sum = FHE.add(FHE.add(attack, health), defense);
        ebool isValid = FHE.eq(sum, FHE.asEuint32(STAT_POINTS));
        // Avoid on-chain decryption; invalid allocations yield zeroed stats.
        euint32 zero = FHE.asEuint32(0);
        attack = FHE.select(isValid, attack, zero);
        health = FHE.select(isValid, health, zero);
        defense = FHE.select(isValid, defense, zero);

        uint256 tokenId = _nextTokenId++;
        _owners[tokenId] = msg.sender;
        _balances[msg.sender] += 1;
        _ownedToken[msg.sender] = tokenId;

        _soldiers[tokenId] = SoldierStats({attack: attack, health: health, defense: defense});
        _scores[tokenId] = FHE.asEuint32(0);

        _allowStatsAndScore(tokenId, msg.sender);

        emit Transfer(address(0), msg.sender, tokenId);
        emit SoldierMinted(msg.sender, tokenId);
    }

    function attackMonster(uint256 tokenId) external {
        require(_owners[tokenId] == msg.sender, "Not token owner");

        SoldierStats storage stats = _soldiers[tokenId];

        euint32 monsterPower = FHE.randEuint32(101);
        euint32 totalPower = FHE.add(stats.attack, stats.defense);
        ebool win = FHE.gt(totalPower, monsterPower);

        euint32 baseReward = FHE.select(
            win,
            FHE.asEuint32(BASE_WIN_REWARD),
            FHE.asEuint32(BASE_LOSS_REWARD)
        );
        euint32 healthBonus = FHE.div(stats.health, 10);
        euint32 reward = FHE.add(baseReward, healthBonus);

        _scores[tokenId] = FHE.add(_scores[tokenId], reward);

        FHE.allowThis(_scores[tokenId]);
        FHE.allow(_scores[tokenId], msg.sender);

        emit MonsterAttacked(msg.sender, tokenId);
    }

    function _allowStatsAndScore(uint256 tokenId, address owner) internal {
        SoldierStats storage stats = _soldiers[tokenId];

        FHE.allowThis(stats.attack);
        FHE.allowThis(stats.health);
        FHE.allowThis(stats.defense);
        FHE.allowThis(_scores[tokenId]);

        FHE.allow(stats.attack, owner);
        FHE.allow(stats.health, owner);
        FHE.allow(stats.defense, owner);
        FHE.allow(_scores[tokenId], owner);
    }
}
