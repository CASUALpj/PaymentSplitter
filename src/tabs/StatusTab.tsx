import { useState } from "react";
import { ethers } from "ethers";
import { CheckCircle2, Loader2, Search, XCircle } from "lucide-react";
import { SPLITTER_ABI } from "../config";
import { useWallet } from "../context/WalletContext";
import {
  extractShortError,
  formatTimestamp,
  getReadProvider,
  isValidAddress,
} from "../lib/ethereum";
import { AddressDisplay } from "../components/AddressDisplay";

interface StatusResult {
  wallet: string;
  splitter: string;
  subscribed: boolean;
  expiry: bigint;
  durationDays: bigint;
}

export function StatusTab() {
  const { address: connectedAddress, selectedNetwork } = useWallet();
  const [walletInput, setWalletInput] = useState("");
  const [splitterInput, setSplitterInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StatusResult | null>(null);

  const trimmedWallet = walletInput.trim();
  const trimmedSplitter = splitterInput.trim();
  const walletValid = isValidAddress(trimmedWallet);
  const splitterValid = isValidAddress(trimmedSplitter);

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletValid || !splitterValid) {
      setError("Enter both a valid wallet address and splitter address.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const provider = getReadProvider(selectedNetwork);
      const splitter = new ethers.Contract(trimmedSplitter, SPLITTER_ABI, provider);
      const [subscribed, expiry, durationDays] = await Promise.all([
        splitter.isSubscribed(trimmedWallet) as Promise<boolean>,
        splitter.subscriptionExpiry(trimmedWallet) as Promise<bigint>,
        splitter.subscriptionDurationDays() as Promise<bigint>,
      ]);

      setResult({
        wallet: trimmedWallet,
        splitter: trimmedSplitter,
        subscribed,
        expiry,
        durationDays,
      });
    } catch (err) {
      setError(extractShortError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
          Subscription Status
        </h1>
        <p className="text-sm text-zinc-400">
          Check whether any wallet has an active subscription on a splitter contract.
        </p>
      </div>

      <form
        onSubmit={handleCheck}
        className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="status-wallet" className="text-sm font-medium text-zinc-200">
              Wallet address
            </label>
            {connectedAddress ? (
              <button
                type="button"
                onClick={() => setWalletInput(connectedAddress)}
                className="min-h-[36px] rounded-lg px-2.5 text-xs font-medium text-blue-400 transition-colors hover:bg-zinc-800"
              >
                Use connected
              </button>
            ) : null}
          </div>
          <input
            id="status-wallet"
            type="text"
            value={walletInput}
            onChange={(e) => setWalletInput(e.target.value)}
            placeholder="0x… wallet address"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className={`h-12 w-full rounded-xl border bg-zinc-950 px-3.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none ${
              trimmedWallet.length > 0 && !walletValid
                ? "border-red-500/60 focus:border-red-400"
                : "border-zinc-800 focus:border-blue-500"
            }`}
          />
          {trimmedWallet.length > 0 && !walletValid ? (
            <p className="text-xs text-red-400">Invalid wallet address</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="status-splitter" className="block text-sm font-medium text-zinc-200">
            Splitter address
          </label>
          <input
            id="status-splitter"
            type="text"
            value={splitterInput}
            onChange={(e) => setSplitterInput(e.target.value)}
            placeholder="0x… splitter address"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className={`h-12 w-full rounded-xl border bg-zinc-950 px-3.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none ${
              trimmedSplitter.length > 0 && !splitterValid
                ? "border-red-500/60 focus:border-red-400"
                : "border-zinc-800 focus:border-blue-500"
            }`}
          />
          {trimmedSplitter.length > 0 && !splitterValid ? (
            <p className="text-xs text-red-400">Invalid splitter address</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={!walletValid || !splitterValid || loading}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Checking…
            </>
          ) : (
            <>
              <Search className="h-4 w-4" aria-hidden="true" />
              Check Status
            </>
          )}
        </button>
      </form>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-zinc-900 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-zinc-300">Status</span>
            {result.subscribed ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-300">
                <XCircle className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                Expired
              </span>
            )}
          </div>

          <div className="h-px bg-zinc-800" />

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-400">Expiry date</span>
              <span className="font-mono tabular-nums text-zinc-100">
                {formatTimestamp(result.expiry)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-400">Subscription term</span>
              <span className="font-mono tabular-nums text-zinc-100">
                {result.durationDays === 0n ? "Disabled" : `${result.durationDays.toString()} days`}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-400">Wallet</span>
              <AddressDisplay address={result.wallet} showExplorer />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-400">Splitter</span>
              <AddressDisplay address={result.splitter} showExplorer />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
