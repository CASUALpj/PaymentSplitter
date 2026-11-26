import { useState } from "react";
import { ethers } from "ethers";
import { Check, Copy, ExternalLink, Rocket } from "lucide-react";
import { FACTORY_ABI } from "../config";
import { useWallet } from "../context/WalletContext";
import {
  explorerAddressUrl,
  extractShortError,
  getWriteSigner,
  truncateAddress,
} from "../lib/ethereum";
import {
  computeRecipientsValidation,
  createEmptyRecipientRow,
  RecipientRow,
  RecipientsEditor,
} from "../components/RecipientsEditor";
import { INITIAL_TX_STATE, TxState, TxStatus } from "../components/TxStatus";

export function CreateTab() {
  const { address, selectedNetwork, connect, isConnecting } = useWallet();
  const [rows, setRows] = useState<RecipientRow[]>([
    createEmptyRecipientRow("100"),
  ]);
  const [subscriptionDays, setSubscriptionDays] = useState("0");
  const [txState, setTxState] = useState<TxState>(INITIAL_TX_STATE);
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null);
  const [copiedDeployed, setCopiedDeployed] = useState(false);

  const validation = computeRecipientsValidation(rows);
  const parsedDays = subscriptionDays.trim() === "" ? 0 : Number(subscriptionDays);
  const isDaysValid =
    Number.isInteger(parsedDays) && parsedDays >= 0;
  const isPending = txState.status === "pending";
  const factoryAddress = selectedNetwork.factoryAddress;
  const isFactoryPlaceholder = factoryAddress === ethers.ZeroAddress;

  const canDeploy = validation.isValid && isDaysValid && !isPending;

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.isValid || !isDaysValid || isPending) return;

    if (isFactoryPlaceholder) {
      setTxState({
        status: "error",
        error: `FACTORY_ADDRESS for ${selectedNetwork.name} in src/config.ts is still the zero placeholder address.`,
      });
      return;
    }

    if (!ethers.isAddress(factoryAddress)) {
      setTxState({
        status: "error",
        error: `Configured factory address for ${selectedNetwork.name} is not a valid address.`,
      });
      return;
    }

    for (const r of validation.recipients) {
      if (!ethers.isAddress(r)) {
        setTxState({ status: "error", error: `Invalid recipient address: ${r}` });
        return;
      }
    }

    setDeployedAddress(null);
    setTxState({ status: "pending", message: "Confirm deployment in your wallet…" });

    try {
      const signer = await getWriteSigner(selectedNetwork);
      const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, signer);

      const tx = await factory.createSplitter(
        validation.recipients,
        validation.sharesBps,
        BigInt(parsedDays)
      );

      setTxState({
        status: "pending",
        message: "Deploying splitter contract…",
        txHash: tx.hash,
      });

      const receipt = await tx.wait();
      const iface = new ethers.Interface(FACTORY_ABI);
      let createdSplitter: string | null = null;

      if (receipt?.logs) {
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog({
              topics: Array.from(log.topics),
              data: log.data,
            });
            if (parsed && parsed.name === "SplitterCreated") {
              createdSplitter = parsed.args.splitter as string;
              break;
            }
          } catch {
            // Skip logs from other contracts
          }
        }
      }

      if (createdSplitter) {
        setDeployedAddress(createdSplitter);
      }

      setTxState({
        status: "success",
        message: createdSplitter
          ? "Splitter deployed successfully."
          : "Transaction confirmed (SplitterCreated event not found in receipt).",
        txHash: receipt?.hash ?? tx.hash,
      });
    } catch (err) {
      setTxState({
        status: "error",
        error: extractShortError(err),
      });
    }
  };

  const handleCopyDeployed = async () => {
    if (!deployedAddress) return;
    try {
      await navigator.clipboard.writeText(deployedAddress);
      setCopiedDeployed(true);
      window.setTimeout(() => setCopiedDeployed(false), 1600);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
          Create Splitter
        </h1>
        <p className="text-sm text-zinc-400">
          Define recipient shares totaling 100% and optional subscription duration.
        </p>
      </div>

      {isFactoryPlaceholder ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-400">
          Factory address for {selectedNetwork.name} is currently set to{" "}
          <span className="font-mono text-zinc-200">{truncateAddress(factoryAddress)}</span>.
          Update <span className="font-mono text-zinc-200">src/config.ts</span> before deploying.
        </div>
      ) : null}

      <form onSubmit={handleDeploy} className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <RecipientsEditor
          rows={rows}
          onChange={setRows}
          disabled={isPending}
        />

        <div className="h-px bg-zinc-800" />

        <div className="space-y-2">
          <label
            htmlFor="subscription-days"
            className="block text-sm font-medium text-zinc-200"
          >
            Subscription (days)
          </label>
          <input
            id="subscription-days"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={subscriptionDays}
            disabled={isPending}
            onChange={(e) => setSubscriptionDays(e.target.value)}
            placeholder="0"
            className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 font-mono text-sm tabular-nums text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
          <p className="text-xs text-zinc-400">
            0 = disabled. Use 36500 for effectively unlimited.
          </p>
          {!isDaysValid ? (
            <p className="text-xs text-red-400">Enter a whole number 0 or greater.</p>
          ) : null}
        </div>

        <div className="pt-1">
          {!address ? (
            <button
              type="button"
              disabled={isConnecting || isPending}
              onClick={connect}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              {isConnecting ? "Connecting…" : "Connect Wallet to Deploy"}
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canDeploy}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              <Rocket className="h-4 w-4" aria-hidden="true" />
              {isPending ? "Deploying…" : "Deploy Splitter"}
            </button>
          )}
        </div>
      </form>

      <TxStatus state={txState} />

      {deployedAddress ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-zinc-900 p-5 space-y-3">
          <div className="text-xs font-medium text-emerald-400">
            New Splitter Contract
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-base font-medium tabular-nums text-zinc-50">
              {truncateAddress(deployedAddress)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyDeployed}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
              >
                {copiedDeployed ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                    Copy
                  </>
                )}
              </button>
              <a
                href={explorerAddressUrl(deployedAddress, selectedNetwork)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 text-xs font-medium text-blue-400 transition-colors hover:bg-zinc-800"
              >
                Explorer
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
          <p className="break-all font-mono text-xs text-zinc-400">{deployedAddress}</p>
        </div>
      ) : null}
    </div>
  );
}
