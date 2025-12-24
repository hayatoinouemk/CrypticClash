import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { ethers } from 'ethers';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { Header } from './Header';
import '../styles/CrypticClashApp.css';

type EncryptedHandles = {
  attack: string;
  health: string;
  defense: string;
  score: string;
};

type DecryptedStats = {
  attack?: number;
  health?: number;
  defense?: number;
};

export function CrypticClashApp() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const signerPromise = useEthersSigner({ chainId: sepolia.id });
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [attack, setAttack] = useState(40);
  const [health, setHealth] = useState(30);
  const [defense, setDefense] = useState(30);
  const [tokenId, setTokenId] = useState<bigint | null>(null);
  const [encrypted, setEncrypted] = useState<EncryptedHandles | null>(null);
  const [decryptedStats, setDecryptedStats] = useState<DecryptedStats>({});
  const [decryptedScore, setDecryptedScore] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isMinting, setIsMinting] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);
  const [isDecryptingStats, setIsDecryptingStats] = useState(false);
  const [isDecryptingScore, setIsDecryptingScore] = useState(false);

  const totalPoints = useMemo(() => attack + health + defense, [attack, health, defense]);
  const remainingPoints = useMemo(() => 100 - totalPoints, [totalPoints]);
  const allocationPercent = useMemo(() => Math.min(100, Math.max(0, (totalPoints / 100) * 100)), [totalPoints]);

  const shortHandle = (value?: string) => {
    if (!value) {
      return '—';
    }
    return `${value.slice(0, 8)}...${value.slice(-6)}`;
  };

  const clampStat = (value: number) => Math.max(0, Math.min(100, Math.floor(value)));

  const loadEncryptedData = useCallback(
    async (ownedToken: bigint) => {
      if (!publicClient) {
        return;
      }
      const [attackHandle, healthHandle, defenseHandle] = (await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getSoldierStats',
        args: [ownedToken],
      })) as readonly [string, string, string];

      const scoreHandle = (await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getEncryptedScore',
        args: [ownedToken],
      })) as string;

      setEncrypted({
        attack: attackHandle,
        health: healthHandle,
        defense: defenseHandle,
        score: scoreHandle,
      });
    },
    [publicClient],
  );

  const loadOwnedToken = useCallback(async () => {
    if (!publicClient || !address) {
      return;
    }
    const ownedToken = (await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'getOwnedToken',
      args: [address],
    })) as bigint;

    if (ownedToken === 0n) {
      setTokenId(null);
      setEncrypted(null);
      setDecryptedStats({});
      setDecryptedScore(null);
      return;
    }

    setTokenId(ownedToken);
    await loadEncryptedData(ownedToken);
  }, [address, loadEncryptedData, publicClient]);

  useEffect(() => {
    if (!isConnected) {
      setTokenId(null);
      setEncrypted(null);
      setDecryptedStats({});
      setDecryptedScore(null);
      return;
    }
    loadOwnedToken();
  }, [isConnected, loadOwnedToken]);

  const decryptHandles = useCallback(
    async (handles: string[]) => {
      if (!instance || !address || !signerPromise) {
        return null;
      }
      const signer = await signerPromise;
      if (!signer) {
        return null;
      }

      const keypair = instance.generateKeypair();
      const handleContractPairs = handles.map((handle) => ({
        handle,
        contractAddress: CONTRACT_ADDRESS,
      }));
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [CONTRACT_ADDRESS];
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      return instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );
    },
    [address, instance, signerPromise],
  );

  const handleMint = async () => {
    if (!address || !instance || !signerPromise) {
      setStatusMessage('Connect your wallet and wait for the encryption service.');
      return;
    }
    if (remainingPoints !== 0 || [attack, health, defense].some((value) => value < 0 || value > 100)) {
      setStatusMessage('Allocate exactly 100 points with non-negative values.');
      return;
    }

    try {
      setIsMinting(true);
      setStatusMessage(null);
      const signer = await signerPromise;
      if (!signer) {
        setStatusMessage('Wallet signer unavailable.');
        return;
      }

      const encryptedInput = await instance
        .createEncryptedInput(CONTRACT_ADDRESS, address)
        .add32(attack)
        .add32(health)
        .add32(defense)
        .encrypt();

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.mintSoldier(
        encryptedInput.handles[0],
        encryptedInput.handles[1],
        encryptedInput.handles[2],
        encryptedInput.inputProof,
      );
      await tx.wait();
      await loadOwnedToken();
      setStatusMessage('Soldier minted. Encrypted stats are ready to decrypt.');
    } catch (error: any) {
      console.error(error);
      setStatusMessage(error?.shortMessage || error?.message || 'Minting failed.');
    } finally {
      setIsMinting(false);
    }
  };

  const handleAttack = async () => {
    if (!tokenId || !signerPromise) {
      setStatusMessage('Mint a soldier first.');
      return;
    }

    try {
      setIsAttacking(true);
      setStatusMessage(null);
      const signer = await signerPromise;
      if (!signer) {
        setStatusMessage('Wallet signer unavailable.');
        return;
      }
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.attackMonster(tokenId);
      await tx.wait();
      await loadEncryptedData(tokenId);
      setStatusMessage('Attack submitted. Decrypt your score to see the reward.');
    } catch (error: any) {
      console.error(error);
      setStatusMessage(error?.shortMessage || error?.message || 'Attack failed.');
    } finally {
      setIsAttacking(false);
    }
  };

  const handleDecryptStats = async () => {
    if (!encrypted) {
      return;
    }
    try {
      setIsDecryptingStats(true);
      setStatusMessage(null);
      const result = await decryptHandles([encrypted.attack, encrypted.health, encrypted.defense]);
      if (!result) {
        setStatusMessage('Unable to decrypt stats right now.');
        return;
      }
      setDecryptedStats({
        attack: Number(result[encrypted.attack]),
        health: Number(result[encrypted.health]),
        defense: Number(result[encrypted.defense]),
      });
    } catch (error: any) {
      console.error(error);
      setStatusMessage(error?.shortMessage || error?.message || 'Stat decryption failed.');
    } finally {
      setIsDecryptingStats(false);
    }
  };

  const handleDecryptScore = async () => {
    if (!encrypted) {
      return;
    }
    try {
      setIsDecryptingScore(true);
      setStatusMessage(null);
      const result = await decryptHandles([encrypted.score]);
      if (!result) {
        setStatusMessage('Unable to decrypt score right now.');
        return;
      }
      setDecryptedScore(Number(result[encrypted.score]));
    } catch (error: any) {
      console.error(error);
      setStatusMessage(error?.shortMessage || error?.message || 'Score decryption failed.');
    } finally {
      setIsDecryptingScore(false);
    }
  };

  return (
    <div className="cc-app">
      <Header />
      <main className="cc-main">
        <section className="cc-hero">
          <div className="cc-hero-text">
            <p className="cc-kicker">Encrypted Arena</p>
            <h2>Forge a soldier, keep the stats private, and farm encrypted glory.</h2>
            <p className="cc-subtitle">
              Each stat is encrypted on-chain. You control decryption with your wallet signature.
            </p>
            <div className="cc-hero-meta">
              <div>
                <span>Network</span>
                <strong>Sepolia</strong>
              </div>
              <div>
                <span>Contract</span>
                <strong>{shortHandle(CONTRACT_ADDRESS)}</strong>
              </div>
            </div>
          </div>
          <div className="cc-hero-card">
            <div className="cc-hero-card-top">
              <span className="cc-badge">{tokenId ? 'Soldier Online' : 'Ready to Mint'}</span>
              <span className={`cc-connection ${isConnected ? 'online' : 'offline'}`}>
                {isConnected ? 'Wallet connected' : 'Wallet disconnected'}
              </span>
            </div>
            <div className="cc-hero-card-body">
              <div>
                <p>Token</p>
                <strong>{tokenId ? `#${tokenId.toString()}` : '—'}</strong>
              </div>
              <div>
                <p>Encrypted Score</p>
                <strong>{encrypted ? shortHandle(encrypted.score) : '—'}</strong>
              </div>
            </div>
            <div className="cc-hero-card-footer">
              <button
                className="cc-button ghost"
                onClick={handleDecryptScore}
                disabled={!encrypted || isDecryptingScore || !isConnected}
              >
                {isDecryptingScore ? 'Decrypting…' : 'Decrypt Score'}
              </button>
            </div>
          </div>
        </section>

        <section className="cc-grid">
          <div className="cc-panel">
            <div className="cc-panel-header">
              <h3>Mint Soldier</h3>
              <span className={`cc-pill ${remainingPoints === 0 ? 'good' : 'warn'}`}>
                {remainingPoints === 0 ? 'Balanced' : `${remainingPoints} left`}
              </span>
            </div>
            <p className="cc-panel-subtitle">Distribute 100 points across three encrypted stats.</p>
            <div className="cc-allocation">
              <div className="cc-allocation-bar">
                <div className="cc-allocation-fill" style={{ width: `${allocationPercent}%` }} />
              </div>
              <div className="cc-allocation-values">
                <span>Total: {totalPoints}</span>
                <span>Target: 100</span>
              </div>
            </div>
            <div className="cc-input-grid">
              <label>
                Attack
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={attack}
                  onChange={(event) => setAttack(clampStat(Number(event.target.value)))}
                />
              </label>
              <label>
                Health
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={health}
                  onChange={(event) => setHealth(clampStat(Number(event.target.value)))}
                />
              </label>
              <label>
                Defense
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={defense}
                  onChange={(event) => setDefense(clampStat(Number(event.target.value)))}
                />
              </label>
            </div>
            <button
              className="cc-button"
              onClick={handleMint}
              disabled={isMinting || !isConnected || remainingPoints !== 0 || zamaLoading}
            >
              {isMinting ? 'Minting…' : 'Mint Encrypted Soldier'}
            </button>
            {zamaError && <p className="cc-error">Encryption service unavailable.</p>}
          </div>

          <div className="cc-panel">
            <div className="cc-panel-header">
              <h3>Your Soldier</h3>
              <button className="cc-button ghost" onClick={loadOwnedToken} disabled={!isConnected}>
                Refresh
              </button>
            </div>
            <p className="cc-panel-subtitle">Encrypted handles live on-chain until you decrypt them.</p>
            <div className="cc-stat-list">
              <div>
                <span>Attack</span>
                <strong>{encrypted ? shortHandle(encrypted.attack) : '—'}</strong>
                <em>{decryptedStats.attack ?? 'Encrypted'}</em>
              </div>
              <div>
                <span>Health</span>
                <strong>{encrypted ? shortHandle(encrypted.health) : '—'}</strong>
                <em>{decryptedStats.health ?? 'Encrypted'}</em>
              </div>
              <div>
                <span>Defense</span>
                <strong>{encrypted ? shortHandle(encrypted.defense) : '—'}</strong>
                <em>{decryptedStats.defense ?? 'Encrypted'}</em>
              </div>
            </div>
            <button
              className="cc-button ghost"
              onClick={handleDecryptStats}
              disabled={!encrypted || isDecryptingStats || !isConnected}
            >
              {isDecryptingStats ? 'Decrypting…' : 'Decrypt Stats'}
            </button>
          </div>

          <div className="cc-panel">
            <div className="cc-panel-header">
              <h3>Battle Monster</h3>
              <span className="cc-pill subtle">Encrypted rewards</span>
            </div>
            <p className="cc-panel-subtitle">Each attack rolls an encrypted monster power and grants a hidden score.</p>
            <div className="cc-battle">
              <div>
                <span>Encrypted Score</span>
                <strong>{encrypted ? shortHandle(encrypted.score) : '—'}</strong>
              </div>
              <div>
                <span>Decrypted Score</span>
                <strong>{decryptedScore ?? 'Encrypted'}</strong>
              </div>
            </div>
            <button className="cc-button" onClick={handleAttack} disabled={!tokenId || isAttacking || !isConnected}>
              {isAttacking ? 'Attacking…' : 'Attack Monster'}
            </button>
            <button
              className="cc-button ghost"
              onClick={handleDecryptScore}
              disabled={!encrypted || isDecryptingScore || !isConnected}
            >
              {isDecryptingScore ? 'Decrypting…' : 'Decrypt Score'}
            </button>
          </div>
        </section>

        {statusMessage && <div className="cc-status">{statusMessage}</div>}
      </main>
    </div>
  );
}
