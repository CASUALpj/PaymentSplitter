import { ethers } from "ethers";
import { CHAIN_CONFIG, NetworkConfig } from "../config";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, listener: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
    };
  }
}

const providerCache = new Map<string, ethers.JsonRpcProvider>();

export function getReadProvider(network: NetworkConfig = CHAIN_CONFIG): ethers.JsonRpcProvider {
  let provider = providerCache.get(network.rpcUrl);
  if (!provider) {
    provider = new ethers.JsonRpcProvider(network.rpcUrl);
    providerCache.set(network.rpcUrl, provider);
  }
  return provider;
}

export function getChainIdHex(chainId: number = CHAIN_CONFIG.chainId): string {
  return "0x" + chainId.toString(16);
}

export async function switchOrAddChain(network: NetworkConfig = CHAIN_CONFIG): Promise<void> {
  if (!window.ethereum) {
    throw new Error("No injected wallet found. Please install a Web3 wallet.");
  }

  const chainIdHex = getChainIdHex(network.chainId);
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (err: unknown) {
    const code =
      (err as { code?: number; data?: { originalError?: { code?: number } } })?.code ??
      (err as { data?: { originalError?: { code?: number } } })?.data?.originalError?.code;
    if (code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: network.name,
            rpcUrls: [network.rpcUrl],
            blockExplorerUrls: [network.explorerUrl],
            nativeCurrency: network.nativeCurrency,
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export async function getWriteSigner(network: NetworkConfig = CHAIN_CONFIG): Promise<ethers.Signer> {
  if (!window.ethereum) {
    throw new Error("No injected wallet found. Please install a Web3 wallet.");
  }
  await switchOrAddChain(network);
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
}

export function isValidAddress(value: string): boolean {
  return ethers.isAddress(value.trim());
}

export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function explorerTxUrl(txHash: string, network: NetworkConfig = CHAIN_CONFIG): string {
  return `${network.explorerUrl}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string, network: NetworkConfig = CHAIN_CONFIG): string {
  return `${network.explorerUrl}/address/${address}`;
}

export function encodeRefId(text: string): string {
  if (!text) {
    return ethers.ZeroHash;
  }
  const bytes = ethers.toUtf8Bytes(text);
  if (bytes.length <= 31) {
    return ethers.encodeBytes32String(text);
  }
  return ethers.keccak256(bytes);
}

export function extractShortError(err: unknown): string {
  if (!err) return "Transaction failed";
  const e = err as {
    shortMessage?: string;
    reason?: string;
    message?: string;
    info?: { error?: { message?: string } };
  };
  if (e.shortMessage && typeof e.shortMessage === "string") {
    return e.shortMessage;
  }
  if (e.reason && typeof e.reason === "string") {
    return e.reason;
  }
  if (e.info?.error?.message) {
    return e.info.error.message;
  }
  if (e.message && typeof e.message === "string") {
    return e.message.length > 140 ? e.message.slice(0, 140) + "…" : e.message;
  }
  return "Transaction failed";
}

export function formatTimestamp(seconds: bigint): string {
  if (seconds === 0n) return "Never";
  const ms = Number(seconds) * 1000;
  if (!Number.isFinite(ms)) return seconds.toString();
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBpsPercent(bps: bigint | number): string {
  const num = typeof bps === "bigint" ? Number(bps) : bps;
  return (num / 100).toFixed(num % 100 === 0 ? 0 : 2).replace(/\.?0+$/, "");
}
