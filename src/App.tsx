import { useState } from "react";
import {
  Check,
  Coins,
  Copy,
  Layers,
  PlusCircle,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { NETWORK_LIST } from "./config";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { truncateAddress } from "./lib/ethereum";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CreateTab } from "./tabs/CreateTab";
import { MySplittersTab } from "./tabs/MySplittersTab";
import { PayTab } from "./tabs/PayTab";
import { StatusTab } from "./tabs/StatusTab";

type TabId = "create" | "splitters" | "pay" | "status";

const TABS: { id: TabId; label: string; icon: typeof PlusCircle }[] = [
  { id: "create", label: "Create", icon: PlusCircle },
  { id: "splitters", label: "My Splitters", icon: Layers },
  { id: "pay", label: "Pay", icon: Coins },
  { id: "status", label: "Status", icon: ShieldCheck },
];

function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>("create");
  const [copiedWallet, setCopiedWallet] = useState(false);
  const {
    address,
    selectedNetwork,
    isConnecting,
    isCorrectChain,
    connectError,
    connect,
    switchChain,
    selectNetwork,
  } = useWallet();

  const handleCopyWallet = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopiedWallet(true);
      window.setTimeout(() => setCopiedWallet(false), 1600);
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      {/* Compact Sticky Top Bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-4 px-4">
          <span className="text-base font-bold tracking-tight text-zinc-50 whitespace-nowrap shrink-0">
            Ledger
          </span>

          <div className="flex items-center gap-2 shrink-0">
            {address ? (
              isCorrectChain ? (
                <button
                  type="button"
                  onClick={handleCopyWallet}
                  title={`Copy ${address}`}
                  aria-label={`Copy connected address ${address}`}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 font-mono text-xs font-medium tabular-nums text-zinc-100 transition-colors hover:bg-zinc-800 whitespace-nowrap shrink-0"
                >
                  <span>{truncateAddress(address)}</span>
                  {copiedWallet ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={switchChain}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-amber-500/40 bg-zinc-900 px-3 text-xs font-medium text-amber-300 transition-colors hover:bg-zinc-800 whitespace-nowrap shrink-0"
                >
                  Switch to {selectedNetwork.name}
                </button>
              )
            ) : (
              <button
                type="button"
                disabled={isConnecting}
                onClick={connect}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                {isConnecting ? "Connecting…" : "Connect"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <main className="mx-auto max-w-2xl px-4 pt-4 pb-24">
        {/* Network Selector */}
        <div
          role="group"
          aria-label="Select network"
          className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1"
        >
          {NETWORK_LIST.map((net) => {
            const active = net.id === selectedNetwork.id;
            return (
              <button
                key={net.id}
                type="button"
                onClick={() => selectNetwork(net.id)}
                className={`min-h-[44px] rounded-lg px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {net.name}
              </button>
            );
          })}
        </div>

        {connectError ? (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-500/30 bg-zinc-900 p-3.5 text-xs text-red-300"
          >
            {connectError}
          </div>
        ) : null}

        {activeTab === "create" ? (
          <ErrorBoundary tabName="Create">
            <CreateTab />
          </ErrorBoundary>
        ) : null}

        {activeTab === "splitters" ? (
          <ErrorBoundary tabName="My Splitters">
            <MySplittersTab />
          </ErrorBoundary>
        ) : null}

        {activeTab === "pay" ? (
          <ErrorBoundary tabName="Pay">
            <PayTab />
          </ErrorBoundary>
        ) : null}

        {activeTab === "status" ? (
          <ErrorBoundary tabName="Status">
            <StatusTab />
          </ErrorBoundary>
        ) : null}
      </main>

      {/* Fixed Bottom Tab Bar */}
      <nav
        aria-label="Primary navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto grid h-14 max-w-2xl grid-cols-4 items-center">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={active ? "page" : undefined}
                className={`flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500 ${
                  active ? "text-blue-400" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="text-[11px] font-medium leading-tight whitespace-nowrap">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <AppShell />
    </WalletProvider>
  );
}
