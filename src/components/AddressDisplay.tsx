import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { explorerAddressUrl, truncateAddress } from "../lib/ethereum";

interface AddressDisplayProps {
  address: string;
  showExplorer?: boolean;
  label?: string;
  className?: string;
}

export function AddressDisplay({
  address,
  showExplorer = false,
  label,
  className = "",
}: AddressDisplayProps) {
  const { selectedNetwork } = useWallet();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {label ? <span className="text-xs text-zinc-400">{label}</span> : null}
      <button
        type="button"
        onClick={handleCopy}
        title={`Copy ${address}`}
        aria-label={`Copy address ${address}`}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-sm text-zinc-100 transition-colors hover:bg-zinc-800 active:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        <span className="tabular-nums">{truncateAddress(address)}</span>
        {copied ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
        )}
        {copied ? <span className="text-xs font-sans text-emerald-400">Copied</span> : null}
      </button>
      {showExplorer ? (
        <a
          href={explorerAddressUrl(address, selectedNetwork)}
          target="_blank"
          rel="noopener noreferrer"
          title={`View on ${selectedNetwork.name} Explorer`}
          aria-label={`View ${address} on ${selectedNetwork.name} Explorer`}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      ) : null}
    </span>
  );
}
