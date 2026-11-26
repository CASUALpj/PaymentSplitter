import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { explorerTxUrl, truncateAddress } from "../lib/ethereum";

export interface TxState {
  status: "idle" | "pending" | "success" | "error";
  message?: string;
  txHash?: string;
  error?: string;
}

export const INITIAL_TX_STATE: TxState = { status: "idle" };

interface TxStatusProps {
  state: TxState;
  className?: string;
}

export function TxStatus({ state, className = "" }: TxStatusProps) {
  const { selectedNetwork } = useWallet();

  if (state.status === "idle") return null;

  if (state.status === "pending") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`rounded-xl border border-zinc-800 bg-zinc-900 p-4 ${className}`}
      >
        <div className="flex items-start gap-3">
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-blue-400" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium text-zinc-100">
              {state.message || "Transaction pending…"}
            </p>
            {state.txHash ? (
              <a
                href={explorerTxUrl(state.txHash, selectedNetwork)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[36px] items-center gap-1.5 font-mono text-xs text-blue-400 hover:underline"
              >
                <span>Tx: {truncateAddress(state.txHash)}</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`rounded-xl border border-emerald-500/30 bg-zinc-900 p-4 ${className}`}
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium text-emerald-300">
              {state.message || "Transaction confirmed"}
            </p>
            {state.txHash ? (
              <a
                href={explorerTxUrl(state.txHash, selectedNetwork)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[36px] items-center gap-1.5 font-mono text-xs text-blue-400 hover:underline"
              >
                <span>
                  View on {selectedNetwork.name} Explorer ({truncateAddress(state.txHash)})
                </span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={`rounded-xl border border-red-500/30 bg-zinc-900 p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-red-300">Transaction failed</p>
          <p className="break-words text-xs text-zinc-300">{state.error || "Unknown error"}</p>
          {state.txHash ? (
            <a
              href={explorerTxUrl(state.txHash, selectedNetwork)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[36px] items-center gap-1.5 font-mono text-xs text-blue-400 hover:underline"
            >
              <span>View failed tx ({truncateAddress(state.txHash)})</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
