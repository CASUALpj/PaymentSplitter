import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  ArrowLeft,
  ChevronRight,
  Coins,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { ERC20_ABI, FACTORY_ABI, SPLITTER_ABI } from "../config";
import { useWallet } from "../context/WalletContext";
import {
  encodeRefId,
  extractShortError,
  formatBpsPercent,
  getReadProvider,
  getWriteSigner,
  isValidAddress,
  truncateAddress,
} from "../lib/ethereum";
import { AddressDisplay } from "../components/AddressDisplay";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  computeRecipientsValidation,
  RecipientRow,
  RecipientsEditor,
} from "../components/RecipientsEditor";
import { INITIAL_TX_STATE, TxState, TxStatus } from "../components/TxStatus";

interface SplitterDetail {
  address: string;
  owner: string;
  recipients: { address: string; bps: bigint }[];
  subscriptionDurationDays: bigint;
}

export function MySplittersTab() {
  const { address: connectedAddress, selectedNetwork, connect, isConnecting } = useWallet();

  // List state
  const [ownedSplitters, setOwnedSplitters] = useState<string[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Lookup state
  const [lookupInput, setLookupInput] = useState("");
  const [selectedSplitter, setSelectedSplitter] = useState<string | null>(null);

  // Detail state
  const [detail, setDetail] = useState<SplitterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Owner edit states
  const [editRows, setEditRows] = useState<RecipientRow[]>([]);
  const [editSubDays, setEditSubDays] = useState("0");
  const [newOwnerInput, setNewOwnerInput] = useState("");
  const [confirmTransferOpen, setConfirmTransferOpen] = useState(false);

  // Pending balance check state
  const [balanceCheckWallet, setBalanceCheckWallet] = useState("");
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [ethLoading, setEthLoading] = useState(false);
  const [ethError, setEthError] = useState<string | null>(null);

  const [tokenCheckAddr, setTokenCheckAddr] = useState("");
  const [tokenBalanceInfo, setTokenBalanceInfo] = useState<{
    tokenAddress: string;
    symbol: string;
    decimals: number;
    amount: bigint;
  } | null>(null);
  const [tokenCheckLoading, setTokenCheckLoading] = useState(false);
  const [tokenCheckError, setTokenCheckError] = useState<string | null>(null);

  // Sweep token state
  const [sweepTokenAddr, setSweepTokenAddr] = useState("");
  const [sweepRefText, setSweepRefText] = useState("");

  // Shared transaction state
  const [txState, setTxState] = useState<TxState>(INITIAL_TX_STATE);
  const isTxPending = txState.status === "pending";

  const factoryAddress = selectedNetwork.factoryAddress;
  const isFactoryConfigured =
    factoryAddress !== ethers.ZeroAddress && isValidAddress(factoryAddress);

  // Reset detail selection when switching networks so state stays scoped to active chain
  useEffect(() => {
    setSelectedSplitter(null);
    setDetail(null);
    setDetailError(null);
    setTxState(INITIAL_TX_STATE);
  }, [selectedNetwork.id]);

  const fetchOwnedSplitters = useCallback(async () => {
    if (!connectedAddress || !isValidAddress(connectedAddress) || !isFactoryConfigured) {
      setOwnedSplitters([]);
      setListError(null);
      return;
    }

    setListLoading(true);
    setListError(null);
    try {
      const provider = getReadProvider(selectedNetwork);
      const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
      const list = (await factory.getSplittersByOwner(connectedAddress)) as string[];
      setOwnedSplitters(list);
    } catch (err) {
      setListError(extractShortError(err));
    } finally {
      setListLoading(false);
    }
  }, [connectedAddress, isFactoryConfigured, factoryAddress, selectedNetwork]);

  useEffect(() => {
    fetchOwnedSplitters();
  }, [fetchOwnedSplitters]);

  const fetchSplitterDetail = useCallback(async (splitterAddress: string) => {
    if (!isValidAddress(splitterAddress)) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const provider = getReadProvider(selectedNetwork);
      const splitter = new ethers.Contract(splitterAddress, SPLITTER_ABI, provider);
      const [owner, recipientsResult, subDays] = await Promise.all([
        splitter.owner() as Promise<string>,
        splitter.getRecipients() as Promise<[string[], bigint[]]>,
        splitter.subscriptionDurationDays() as Promise<bigint>,
      ]);

      const [addrs, shares] = recipientsResult;
      const recipients = addrs.map((addr, i) => ({
        address: addr,
        bps: shares[i] ?? 0n,
      }));

      setDetail({
        address: splitterAddress,
        owner,
        recipients,
        subscriptionDurationDays: subDays,
      });

      setEditRows(
        recipients.map((r, idx) => ({
          id: `${idx}-${r.address}`,
          address: r.address,
          percent: formatBpsPercent(r.bps),
        }))
      );
      setEditSubDays(subDays.toString());
    } catch (err) {
      setDetailError(extractShortError(err));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [selectedNetwork]);

  useEffect(() => {
    if (selectedSplitter) {
      setTxState(INITIAL_TX_STATE);
      setEthBalance(null);
      setEthError(null);
      setTokenBalanceInfo(null);
      setTokenCheckError(null);
      fetchSplitterDetail(selectedSplitter);
    }
  }, [selectedSplitter, fetchSplitterDetail]);

  // Keep balance check wallet synced to connected address if empty
  useEffect(() => {
    if (connectedAddress && !balanceCheckWallet) {
      setBalanceCheckWallet(connectedAddress);
    }
  }, [connectedAddress, balanceCheckWallet]);

  const targetWalletForBalance = (balanceCheckWallet.trim() || connectedAddress || "").trim();
  const canCheckWallet = isValidAddress(targetWalletForBalance);

  const checkEthBalance = useCallback(async () => {
    if (!selectedSplitter || !isValidAddress(selectedSplitter) || !canCheckWallet) return;
    setEthLoading(true);
    setEthError(null);
    try {
      const provider = getReadProvider(selectedNetwork);
      const splitter = new ethers.Contract(selectedSplitter, SPLITTER_ABI, provider);
      const bal = (await splitter.balances(ethers.ZeroAddress, targetWalletForBalance)) as bigint;
      setEthBalance(bal);
    } catch (err) {
      setEthError(extractShortError(err));
    } finally {
      setEthLoading(false);
    }
  }, [selectedSplitter, canCheckWallet, targetWalletForBalance, selectedNetwork]);

  // Auto-check ETH balance when opening detail with a valid wallet
  useEffect(() => {
    if (detail && canCheckWallet) {
      checkEthBalance();
    }
  }, [detail, canCheckWallet, checkEthBalance]);

  const checkTokenBalance = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const tokenAddr = tokenCheckAddr.trim();
    if (!selectedSplitter || !isValidAddress(selectedSplitter)) return;
    if (!isValidAddress(tokenAddr)) {
      setTokenCheckError("Invalid token address.");
      return;
    }
    if (!canCheckWallet) {
      setTokenCheckError("Connect a wallet or enter a valid recipient address.");
      return;
    }

    setTokenCheckLoading(true);
    setTokenCheckError(null);
    try {
      const provider = getReadProvider(selectedNetwork);
      const splitter = new ethers.Contract(selectedSplitter, SPLITTER_ABI, provider);
      const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
      const [bal, decimals, symbol] = await Promise.all([
        splitter.balances(tokenAddr, targetWalletForBalance) as Promise<bigint>,
        erc20.decimals().catch(() => 18) as Promise<number | bigint>,
        erc20.symbol().catch(() => "TOKEN") as Promise<string>,
      ]);
      setTokenBalanceInfo({
        tokenAddress: tokenAddr,
        symbol,
        decimals: Number(decimals),
        amount: bal,
      });
    } catch (err) {
      setTokenCheckError(extractShortError(err));
      setTokenBalanceInfo(null);
    } finally {
      setTokenCheckLoading(false);
    }
  };

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = lookupInput.trim();
    if (!isValidAddress(trimmed)) return;
    setSelectedSplitter(trimmed);
  };

  // Transaction runner helper
  const runWriteTx = async (
    pendingMessage: string,
    action: (signer: ethers.Signer) => Promise<ethers.ContractTransactionResponse>,
    successMessage: string,
    onConfirmed?: () => Promise<void>
  ) => {
    if (isTxPending) return;
    setTxState({ status: "pending", message: pendingMessage });
    try {
      const signer = await getWriteSigner(selectedNetwork);
      const tx = await action(signer);
      setTxState({
        status: "pending",
        message: "Waiting for confirmation…",
        txHash: tx.hash,
      });
      const receipt = await tx.wait();
      setTxState({
        status: "success",
        message: successMessage,
        txHash: receipt?.hash ?? tx.hash,
      });
      if (onConfirmed) {
        await onConfirmed();
      }
    } catch (err) {
      setTxState({
        status: "error",
        error: extractShortError(err),
      });
    }
  };

  const handleUpdateDistribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const validation = computeRecipientsValidation(editRows);
    if (!validation.isValid) return;

    await runWriteTx(
      "Confirm distribution update in wallet…",
      async (signer) => {
        const splitter = new ethers.Contract(detail.address, SPLITTER_ABI, signer);
        return splitter.updateDistribution(validation.recipients, validation.sharesBps);
      },
      "Distribution updated.",
      async () => {
        await fetchSplitterDetail(detail.address);
      }
    );
  };

  const handleSetSubDays = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const daysNum = editSubDays.trim() === "" ? 0 : Number(editSubDays);
    if (!Number.isInteger(daysNum) || daysNum < 0) return;

    await runWriteTx(
      "Confirm subscription duration update…",
      async (signer) => {
        const splitter = new ethers.Contract(detail.address, SPLITTER_ABI, signer);
        return splitter.setSubscriptionDuration(BigInt(daysNum));
      },
      "Subscription duration updated.",
      async () => {
        await fetchSplitterDetail(detail.address);
      }
    );
  };

  const handleConfirmTransferOwnership = async () => {
    if (!detail) return;
    const target = newOwnerInput.trim();
    if (!isValidAddress(target)) return;
    setConfirmTransferOpen(false);

    await runWriteTx(
      "Confirm ownership transfer in wallet…",
      async (signer) => {
        const splitter = new ethers.Contract(detail.address, SPLITTER_ABI, signer);
        return splitter.transferOwnership(target);
      },
      "Ownership transferred.",
      async () => {
        setNewOwnerInput("");
        await fetchSplitterDetail(detail.address);
        await fetchOwnedSplitters();
      }
    );
  };

  const handleWithdraw = async (tokenAddress: string, label: string) => {
    if (!detail) return;
    await runWriteTx(
      `Confirm ${label} withdrawal in wallet…`,
      async (signer) => {
        const splitter = new ethers.Contract(detail.address, SPLITTER_ABI, signer);
        return splitter.withdraw(tokenAddress);
      },
      `${label} withdrawn.`,
      async () => {
        if (tokenAddress === ethers.ZeroAddress) {
          await checkEthBalance();
        } else {
          await checkTokenBalance();
        }
      }
    );
  };

  const handleSweepToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const tokenAddr = sweepTokenAddr.trim();
    if (!isValidAddress(tokenAddr)) return;
    const refId = encodeRefId(sweepRefText.trim());

    await runWriteTx(
      "Confirm token sweep in wallet…",
      async (signer) => {
        const splitter = new ethers.Contract(detail.address, SPLITTER_ABI, signer);
        return splitter.sweepUnaccountedToken(tokenAddr, refId);
      },
      "Unaccounted tokens swept.",
      async () => {
        setSweepTokenAddr("");
        setSweepRefText("");
      }
    );
  };

  // DETAIL VIEW
  if (selectedSplitter) {
    const isOwner =
      Boolean(connectedAddress) &&
      Boolean(detail?.owner) &&
      connectedAddress!.toLowerCase() === detail!.owner.toLowerCase();

    const editValidation = computeRecipientsValidation(editRows);
    const parsedEditDays = editSubDays.trim() === "" ? 0 : Number(editSubDays);
    const editDaysValid = Number.isInteger(parsedEditDays) && parsedEditDays >= 0;
    const trimmedNewOwner = newOwnerInput.trim();
    const newOwnerValid = isValidAddress(trimmedNewOwner);
    const isCheckingOwnWallet =
      Boolean(connectedAddress) &&
      targetWalletForBalance.toLowerCase() === connectedAddress!.toLowerCase();

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setSelectedSplitter(null)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>

          <button
            type="button"
            disabled={detailLoading}
            onClick={() => fetchSplitterDetail(selectedSplitter)}
            aria-label="Refresh splitter details"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${detailLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-base font-semibold text-zinc-50">Splitter Contract</h1>
            <AddressDisplay address={selectedSplitter} showExplorer />
          </div>

          {detailLoading && !detail ? (
            <div className="flex items-center gap-2 py-6 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading contract state…
            </div>
          ) : detailError ? (
            <div role="alert" className="rounded-xl border border-red-500/30 bg-zinc-950 p-4 text-sm text-red-300">
              {detailError}
            </div>
          ) : detail ? (
            <div className="space-y-4">
              <div className="h-px bg-zinc-800" />

              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-zinc-400">Owner</span>
                <div className="flex items-center gap-2">
                  <AddressDisplay address={detail.owner} showExplorer />
                  {isOwner ? (
                    <span className="text-xs font-medium text-blue-400">You</span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-zinc-400">Subscription</span>
                <span className="font-mono tabular-nums text-zinc-100">
                  {detail.subscriptionDurationDays === 0n
                    ? "Disabled"
                    : `${detail.subscriptionDurationDays.toString()} days`}
                </span>
              </div>

              <div className="h-px bg-zinc-800" />

              <div className="space-y-2">
                <div className="text-sm font-medium text-zinc-200">
                  Recipients ({detail.recipients.length})
                </div>
                <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-950">
                  {detail.recipients.map((r) => (
                    <div
                      key={r.address}
                      className="flex min-h-[52px] items-center justify-between gap-2 px-3.5 py-2"
                    >
                      <AddressDisplay address={r.address} />
                      <span className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
                        {formatBpsPercent(r.bps)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <TxStatus state={txState} />

        {detail ? (
          <>
            {/* Pending Balances & Withdraw */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-blue-400" aria-hidden="true" />
                <h2 className="text-base font-semibold text-zinc-50">
                  Check My Pending Balance
                </h2>
              </div>

              <div className="space-y-2">
                <label htmlFor="balance-wallet" className="block text-xs text-zinc-400">
                  Recipient wallet address
                </label>
                <div className="flex gap-2">
                  <input
                    id="balance-wallet"
                    type="text"
                    value={balanceCheckWallet}
                    onChange={(e) => setBalanceCheckWallet(e.target.value)}
                    placeholder="0x… wallet address"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="h-12 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!canCheckWallet || ethLoading}
                    onClick={checkEthBalance}
                    className="min-h-[48px] shrink-0 rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {ethLoading ? "Checking…" : "Check ETH"}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-zinc-400">Pending ETH</span>
                  <span className="font-mono text-base font-semibold tabular-nums text-zinc-50">
                    {ethBalance !== null ? `${ethers.formatEther(ethBalance)} ETH` : "—"}
                  </span>
                </div>
                {ethError ? <p className="text-xs text-red-400">{ethError}</p> : null}
                {ethBalance !== null && ethBalance > 0n ? (
                  connectedAddress ? (
                    isCheckingOwnWallet ? (
                      <button
                        type="button"
                        disabled={isTxPending}
                        onClick={() => handleWithdraw(ethers.ZeroAddress, "ETH")}
                        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                      >
                        Withdraw ETH
                      </button>
                    ) : (
                      <p className="text-xs text-zinc-400">
                        Switch to {truncateAddress(targetWalletForBalance)} to withdraw.
                      </p>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled={isConnecting}
                      onClick={connect}
                      className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                    >
                      Connect Wallet to Withdraw
                    </button>
                  )
                ) : null}
              </div>

              <form onSubmit={checkTokenBalance} className="space-y-3">
                <label htmlFor="balance-token" className="block text-xs text-zinc-400">
                  ERC-20 token address
                </label>
                <div className="flex gap-2">
                  <input
                    id="balance-token"
                    type="text"
                    value={tokenCheckAddr}
                    onChange={(e) => setTokenCheckAddr(e.target.value)}
                    placeholder="0x… ERC-20 token address"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="h-12 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!isValidAddress(tokenCheckAddr.trim()) || !canCheckWallet || tokenCheckLoading}
                    className="min-h-[48px] shrink-0 rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {tokenCheckLoading ? "Checking…" : "Check"}
                  </button>
                </div>
                {tokenCheckError ? <p className="text-xs text-red-400">{tokenCheckError}</p> : null}

                {tokenBalanceInfo ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-zinc-400">
                        Pending {tokenBalanceInfo.symbol}
                      </span>
                      <span className="font-mono text-base font-semibold tabular-nums text-zinc-50">
                        {ethers.formatUnits(tokenBalanceInfo.amount, tokenBalanceInfo.decimals)}{" "}
                        {tokenBalanceInfo.symbol}
                      </span>
                    </div>
                    {tokenBalanceInfo.amount > 0n ? (
                      connectedAddress ? (
                        isCheckingOwnWallet ? (
                          <button
                            type="button"
                            disabled={isTxPending}
                            onClick={() =>
                              handleWithdraw(tokenBalanceInfo.tokenAddress, tokenBalanceInfo.symbol)
                            }
                            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                          >
                            Withdraw {tokenBalanceInfo.symbol}
                          </button>
                        ) : (
                          <p className="text-xs text-zinc-400">
                            Switch to {truncateAddress(targetWalletForBalance)} to withdraw.
                          </p>
                        )
                      ) : (
                        <button
                          type="button"
                          disabled={isConnecting}
                          onClick={connect}
                          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                        >
                          Connect Wallet to Withdraw
                        </button>
                      )
                    ) : null}
                  </div>
                ) : null}
              </form>
            </section>

            {/* Sweep Unaccounted Token */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-blue-400" aria-hidden="true" />
                <h2 className="text-base font-semibold text-zinc-50">Sweep Token</h2>
              </div>
              <p className="text-xs text-zinc-400">
                Distribute unaccounted ERC-20 tokens sent directly to this contract.
              </p>
              <form onSubmit={handleSweepToken} className="space-y-3">
                <input
                  type="text"
                  value={sweepTokenAddr}
                  disabled={isTxPending}
                  onChange={(e) => setSweepTokenAddr(e.target.value)}
                  placeholder="0x… token address"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                />
                <input
                  type="text"
                  value={sweepRefText}
                  disabled={isTxPending}
                  onChange={(e) => setSweepRefText(e.target.value)}
                  placeholder="Optional reference (e.g. invoice-42)"
                  className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                />
                {!connectedAddress ? (
                  <button
                    type="button"
                    disabled={isConnecting || isTxPending}
                    onClick={connect}
                    className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                  >
                    Connect Wallet to Sweep
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!isValidAddress(sweepTokenAddr.trim()) || isTxPending}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm font-semibold text-zinc-100 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    Sweep token
                  </button>
                )}
              </form>
            </section>

            {/* Owner-only Actions */}
            {isOwner ? (
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-6">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-blue-400" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-zinc-50">Owner Controls</h2>
                </div>

                {/* Edit Distribution */}
                <form onSubmit={handleUpdateDistribution} className="space-y-4">
                  <h3 className="text-sm font-medium text-zinc-300">Edit Distribution</h3>
                  <RecipientsEditor
                    rows={editRows}
                    onChange={setEditRows}
                    disabled={isTxPending}
                  />
                  <button
                    type="submit"
                    disabled={!editValidation.isValid || isTxPending}
                    className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                  >
                    Save Distribution
                  </button>
                </form>

                <div className="h-px bg-zinc-800" />

                {/* Set Subscription Days */}
                <form onSubmit={handleSetSubDays} className="space-y-3">
                  <label htmlFor="edit-sub-days" className="block text-sm font-medium text-zinc-300">
                    Set Subscription Duration (days)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="edit-sub-days"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={editSubDays}
                      disabled={isTxPending}
                      onChange={(e) => setEditSubDays(e.target.value)}
                      className="h-12 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 font-mono text-sm tabular-nums text-zinc-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={!editDaysValid || isTxPending}
                      className="min-h-[48px] shrink-0 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500"
                    >
                      Save
                    </button>
                  </div>
                  <p className="text-xs text-zinc-400">
                    0 = disabled. Use 36500 for effectively unlimited.
                  </p>
                </form>

                <div className="h-px bg-zinc-800" />

                {/* Transfer Ownership */}
                <div className="space-y-3">
                  <label htmlFor="new-owner-input" className="block text-sm font-medium text-zinc-300">
                    Transfer Ownership
                  </label>
                  <input
                    id="new-owner-input"
                    type="text"
                    value={newOwnerInput}
                    disabled={isTxPending}
                    onChange={(e) => setNewOwnerInput(e.target.value)}
                    placeholder="0x… new owner address"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                  />
                  {trimmedNewOwner.length > 0 && !newOwnerValid ? (
                    <p className="text-xs text-red-400">Invalid Ethereum address</p>
                  ) : null}
                  <button
                    type="button"
                    disabled={!newOwnerValid || isTxPending}
                    onClick={() => setConfirmTransferOpen(true)}
                    className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-red-500/40 bg-zinc-950 px-4 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Transfer Ownership
                  </button>
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        <ConfirmDialog
          open={confirmTransferOpen}
          title="Transfer Splitter Ownership?"
          description={`You are about to transfer ownership of ${truncateAddress(
            selectedSplitter
          )} to ${trimmedNewOwner}. You will immediately lose owner permissions for this splitter.`}
          confirmLabel="Transfer Ownership"
          disabled={isTxPending}
          onConfirm={handleConfirmTransferOwnership}
          onCancel={() => setConfirmTransferOpen(false)}
        />
      </div>
    );
  }

  // LIST + LOOKUP VIEW
  const trimmedLookup = lookupInput.trim();
  const lookupValid = isValidAddress(trimmedLookup);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
          My Splitters
        </h1>
        <p className="text-sm text-zinc-400">
          Inspect splitters you own or open any splitter contract by address.
        </p>
      </div>

      {/* Look up by address */}
      <form
        onSubmit={handleLookupSubmit}
        className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-3"
      >
        <label htmlFor="lookup-splitter" className="block text-sm font-medium text-zinc-200">
          Look up by address
        </label>
        <div className="flex gap-2">
          <input
            id="lookup-splitter"
            type="text"
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            placeholder="0x… splitter address"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="h-12 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!lookupValid}
            className="inline-flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Open
          </button>
        </div>
        {trimmedLookup.length > 0 && !lookupValid ? (
          <p className="text-xs text-red-400">Invalid splitter address</p>
        ) : null}
      </form>

      {/* Owned Splitters List */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-zinc-50">Owned by Wallet</h2>
          {connectedAddress && isFactoryConfigured ? (
            <button
              type="button"
              disabled={listLoading}
              onClick={fetchOwnedSplitters}
              aria-label="Refresh owned splitters"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${listLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {!connectedAddress ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-zinc-400">
              Connect your wallet to list splitters created by your address.
            </p>
            <button
              type="button"
              disabled={isConnecting}
              onClick={connect}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {isConnecting ? "Connecting…" : "Connect Wallet"}
            </button>
          </div>
        ) : !isFactoryConfigured ? (
          <p className="text-sm text-zinc-400">
            Factory address is currently set to the zero placeholder in{" "}
            <span className="font-mono text-zinc-200">src/config.ts</span>. Use "Look up by address"
            above to inspect any deployed splitter.
          </p>
        ) : listLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading splitters…
          </div>
        ) : listError ? (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-zinc-950 p-4 text-sm text-red-300">
            {listError}
          </div>
        ) : ownedSplitters.length === 0 ? (
          <p className="py-2 text-sm text-zinc-400">
            No splitters found for {truncateAddress(connectedAddress)}.
          </p>
        ) : (
          <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-950">
            {ownedSplitters.map((addr) => (
              <button
                key={addr}
                type="button"
                onClick={() => setSelectedSplitter(addr)}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-900"
              >
                <span className="font-mono text-sm tabular-nums text-zinc-100">
                  {truncateAddress(addr)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
