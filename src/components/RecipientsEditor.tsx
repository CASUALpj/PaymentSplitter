import { Plus, Trash2 } from "lucide-react";
import { isValidAddress } from "../lib/ethereum";

export interface RecipientRow {
  id: string;
  address: string;
  percent: string;
}

export function createEmptyRecipientRow(percent = ""): RecipientRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    address: "",
    percent,
  };
}

export function computeRecipientsValidation(rows: RecipientRow[]) {
  let totalPct = 0;
  let totalBps = 0;
  let allAddressesValid = rows.length >= 1;
  let allPercentsPositive = rows.length >= 1;

  const recipients: string[] = [];
  const sharesBps: bigint[] = [];

  for (const row of rows) {
    const trimmed = row.address.trim();
    if (!isValidAddress(trimmed)) {
      allAddressesValid = false;
    }
    const pct = parseFloat(row.percent);
    const bps = Number.isFinite(pct) ? Math.round(pct * 100) : 0;
    if (!Number.isFinite(pct) || pct <= 0 || bps <= 0) {
      allPercentsPositive = false;
    }
    totalPct += Number.isFinite(pct) ? pct : 0;
    totalBps += bps;
    recipients.push(trimmed);
    sharesBps.push(BigInt(Math.max(0, bps)));
  }

  // Round display total cleanly to avoid 33.33 + 33.33 + 33.34 floating artifacts
  const roundedTotalPct = Math.round(totalPct * 100) / 100;
  const isExact100 = roundedTotalPct === 100 && totalBps === 10000;
  const isValid = rows.length >= 1 && allAddressesValid && allPercentsPositive && isExact100;

  return {
    roundedTotalPct,
    totalBps,
    allAddressesValid,
    allPercentsPositive,
    isExact100,
    isValid,
    recipients,
    sharesBps,
  };
}

interface RecipientsEditorProps {
  rows: RecipientRow[];
  onChange: (rows: RecipientRow[]) => void;
  disabled?: boolean;
}

export function RecipientsEditor({ rows, onChange, disabled = false }: RecipientsEditorProps) {
  const validation = computeRecipientsValidation(rows);

  const handleRowChange = (id: string, field: "address" | "percent", value: string) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleAddRow = () => {
    onChange([...rows, createEmptyRecipientRow()]);
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-200">Recipients</span>
        <span
          className={`font-mono text-sm font-medium tabular-nums ${
            validation.isExact100 ? "text-emerald-400" : "text-amber-400"
          }`}
        >
          Total: {validation.roundedTotalPct}%
        </span>
      </div>

      <div className="space-y-2.5">
        {rows.map((row, index) => {
          const trimmed = row.address.trim();
          const showAddressError = trimmed.length > 0 && !isValidAddress(trimmed);
          const pctVal = parseFloat(row.percent);
          const showPctError =
            row.percent.trim().length > 0 && (!Number.isFinite(pctVal) || pctVal <= 0);

          return (
            <div key={row.id} className="space-y-1">
              <div className="flex items-stretch gap-2">
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`recipient-addr-${row.id}`}>
                    Recipient {index + 1} address
                  </label>
                  <input
                    id={`recipient-addr-${row.id}`}
                    type="text"
                    value={row.address}
                    disabled={disabled}
                    onChange={(e) => handleRowChange(row.id, "address", e.target.value)}
                    placeholder="0x… recipient address"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    className={`h-12 w-full rounded-xl border bg-zinc-950 px-3.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50 ${
                      showAddressError
                        ? "border-red-500/60 focus:border-red-400"
                        : "border-zinc-800 focus:border-blue-500"
                    }`}
                  />
                </div>

                <div className="relative w-24 shrink-0">
                  <label className="sr-only" htmlFor={`recipient-pct-${row.id}`}>
                    Recipient {index + 1} percent
                  </label>
                  <input
                    id={`recipient-pct-${row.id}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    value={row.percent}
                    disabled={disabled}
                    onChange={(e) => handleRowChange(row.id, "percent", e.target.value)}
                    placeholder="0"
                    className={`h-12 w-full rounded-xl border bg-zinc-950 pl-3 pr-7 font-mono text-sm tabular-nums text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50 ${
                      showPctError
                        ? "border-red-500/60 focus:border-red-400"
                        : "border-zinc-800 focus:border-blue-500"
                    }`}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                    %
                  </span>
                </div>

                {rows.length > 1 ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => handleRemoveRow(row.id)}
                    aria-label={`Remove recipient ${index + 1}`}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              {showAddressError ? (
                <p className="text-xs text-red-400">Invalid Ethereum address</p>
              ) : null}
              {showPctError ? (
                <p className="text-xs text-red-400">Share must be greater than 0%</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={handleAddRow}
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-900 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add recipient
      </button>
    </div>
  );
}
