import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  DEFAULT_NETWORK_ID,
  NETWORK_LIST,
  NETWORKS,
  NetworkConfig,
  NetworkId,
} from "../config";
import { extractShortError, switchOrAddChain } from "../lib/ethereum";

interface WalletContextValue {
  address: string | null;
  chainId: number | null;
  selectedNetwork: NetworkConfig;
  isConnecting: boolean;
  isCorrectChain: boolean;
  connectError: string | null;
  hasInjectedWallet: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: () => Promise<void>;
  selectNetwork: (networkId: NetworkId) => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [networkId, setNetworkId] = useState<NetworkId>(DEFAULT_NETWORK_ID);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const hasInjectedWallet = typeof window !== "undefined" && Boolean(window.ethereum);

  const selectedNetwork = NETWORKS[networkId];

  const syncSilent = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_accounts",
      })) as string[];
      if (accounts && accounts.length > 0) {
        setAddress(accounts[0]);
      } else {
        setAddress(null);
      }
      const hexChain = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;
      if (hexChain) {
        const parsedId = parseInt(hexChain, 16);
        setChainId(parsedId);
        const matching = NETWORK_LIST.find((n) => n.chainId === parsedId);
        if (matching) {
          setNetworkId(matching.id);
        }
      }
    } catch {
      // Ignore silent check errors
    }
  }, []);

  useEffect(() => {
    syncSilent();
    const eth = window.ethereum;
    if (!eth?.on) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const list = Array.isArray(accounts) ? (accounts as string[]) : [];
      setAddress(list.length > 0 ? list[0] : null);
    };

    const handleChainChanged = (hexChain: unknown) => {
      if (typeof hexChain === "string") {
        const parsedId = parseInt(hexChain, 16);
        setChainId(parsedId);
        const matching = NETWORK_LIST.find((n) => n.chainId === parsedId);
        if (matching) {
          setNetworkId(matching.id);
        }
      }
    };

    eth.on("accountsChanged", handleAccountsChanged);
    eth.on("chainChanged", handleChainChanged);

    return () => {
      eth.removeListener?.("accountsChanged", handleAccountsChanged);
      eth.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [syncSilent]);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setConnectError("No Web3 wallet detected. Open this app in a wallet browser or install MetaMask.");
      return;
    }

    setIsConnecting(true);
    setConnectError(null);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (accounts && accounts.length > 0) {
        setAddress(accounts[0]);
      }

      await switchOrAddChain(selectedNetwork);
      const hexChain = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;
      if (hexChain) {
        setChainId(parseInt(hexChain, 16));
      }
    } catch (err) {
      setConnectError(extractShortError(err));
    } finally {
      setIsConnecting(false);
    }
  }, [selectedNetwork]);

  const switchChain = useCallback(async () => {
    setConnectError(null);
    try {
      await switchOrAddChain(selectedNetwork);
      if (window.ethereum) {
        const hexChain = (await window.ethereum.request({
          method: "eth_chainId",
        })) as string;
        if (hexChain) {
          setChainId(parseInt(hexChain, 16));
        }
      }
    } catch (err) {
      setConnectError(extractShortError(err));
    }
  }, [selectedNetwork]);

  const selectNetwork = useCallback(
    async (nextId: NetworkId) => {
      const nextNet = NETWORKS[nextId];
      setNetworkId(nextId);
      setConnectError(null);

      if (address && window.ethereum) {
        try {
          await switchOrAddChain(nextNet);
          const hexChain = (await window.ethereum.request({
            method: "eth_chainId",
          })) as string;
          if (hexChain) {
            setChainId(parseInt(hexChain, 16));
          }
        } catch (err) {
          setConnectError(extractShortError(err));
        }
      }
    },
    [address]
  );

  const disconnect = useCallback(() => {
    setAddress(null);
    setConnectError(null);
  }, []);

  const isCorrectChain = chainId === selectedNetwork.chainId;

  return (
    <WalletContext.Provider
      value={{
        address,
        chainId,
        selectedNetwork,
        isConnecting,
        isCorrectChain,
        connectError,
        hasInjectedWallet,
        connect,
        disconnect,
        switchChain,
        selectNetwork,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used inside WalletProvider");
  }
  return ctx;
}
