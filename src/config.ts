// Easy-to-edit deployment configuration
export type NetworkId = "ink" | "base" | "robinhood";

export interface NetworkConfig {
  id: NetworkId;
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  factoryAddress: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  ink: {
    id: "ink",
    name: "Ink",
    chainId: 57073,
    rpcUrl: "https://rpc-gel.inkonchain.com",
    explorerUrl: "https://explorer.inkonchain.com",
    factoryAddress: "0x4B43D0C7A23038d00f593DE74D1b4e36cF45D98B",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
  },
  base: {
    id: "base",
    name: "Base",
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
    factoryAddress: "0xe715F4B2722A833E6760AC1411F7B07A9EEeff54",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
  },
  robinhood: {
    id: "robinhood",
    name: "Robinhood",
    chainId: 4663,
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    factoryAddress: "0x083b2A454Cdc3211A7a646aDe005B10964BC1211",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
  },
};

export const NETWORK_LIST: NetworkConfig[] = [
  NETWORKS.ink,
  NETWORKS.base,
  NETWORKS.robinhood,
];

export const DEFAULT_NETWORK_ID: NetworkId = "ink";

// Backwards-compatible defaults pointing to Ink
export const FACTORY_ADDRESS = NETWORKS[DEFAULT_NETWORK_ID].factoryAddress;
export const CHAIN_CONFIG = NETWORKS[DEFAULT_NETWORK_ID];

export const FACTORY_ABI = [
  "function createSplitter(address[] recipients, uint256[] sharesBps, uint256 subscriptionDurationDays) returns (address)",
  "function getSplittersByOwner(address owner) view returns (address[])",
  "event SplitterCreated(address indexed owner, address indexed splitter)",
] as const;

export const SPLITTER_ABI = [
  "function owner() view returns (address)",
  "function getRecipients() view returns (address[], uint256[])",
  "function subscriptionDurationDays() view returns (uint256)",
  "function subscriptionExpiry(address) view returns (uint256)",
  "function isSubscribed(address) view returns (bool)",
  "function balances(address token, address recipient) view returns (uint256)",
  "function updateDistribution(address[] recipients, uint256[] sharesBps)",
  "function setSubscriptionDuration(uint256 days)",
  "function transferOwnership(address newOwner)",
  "function payETH(bytes32 refId) payable",
  "function subscribe(bytes32 refId) payable",
  "function payToken(address token, uint256 amount, bytes32 refId)",
  "function sweepUnaccountedToken(address token, bytes32 refId)",
  "function withdraw(address token)",
] as const;

export const ERC20_ABI = [
  "function approve(address,uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
] as const;
