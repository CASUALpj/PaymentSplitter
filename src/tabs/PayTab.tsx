import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { CheckCircle2, Coins, CreditCard, Loader2, XCircle } from "lucide-react";
import { ERC20_ABI, SPLITTER_ABI } from "../config";
import { useWallet } from "../context/WalletContext";
import {
  encodeRefId,
  extractShortError,
  formatTimestamp,
  getReadProvider,
  getWriteSigner,
  isValidAddress,
} from "../lib/ethereum";
import { INITIAL_TX_STATE, TxState, TxStatus } from "../components/TxStatus";

type PayMode = "ETH" | "ERC20";

interface TokenMeta {
  symbol: string;
  decimals: number;
  balance: bigint | null;
  allowance: bigint | null;
}

export function PayTab() {
  const { address: connectedAddress, selectedNetwork, connect, isConnecting } = useWallet();

  const [splitterInput, setSplitterInput] = useState("");
  const [mode, setMode] = useState<PayMode>("ETH");

  // ETH payment state
  const [ethAmount, setEthAmount] = useState("");
  const [refText, setRefText] = useState("");

  // ERC-20 payment state
  const [tokenInput, setTokenInput] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [tokenMeta, setTokenMeta] = useState<TokenMeta | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Tx statuses (separate approve + payToken for 2-step visibility)
  const [payTxState, setPayTxState] = useState<TxState>(INITIAL_TX_STATE);
  const [approveTxState, setApproveTxState] = useState<TxState>(INITIAL_TX_STATE);

  // Subscription state
  const [subDurationDays, setSubDurationDays] = useState<bigint>(0n);
  const [subInfoLoading, setSubInfoLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [subExpiry, setSubExpiry] = useState<bigint>(0n);
  const [subEthAmount, setSubEthAmount] = useState("");
  const [subRefText, setSubRefText] = useState("");
  const [subTxState, setSubTxState] = useState<TxState>(INITIAL_TX_STATE);

  const trimmedSplitter = splitterInput.trim();
  const splitterValid = isValidAddress(trimmedSplitter);

  const trimmedToken = tokenInput.trim();
  const tokenValid = isValidAddress(trimmedToken);

  const isAnyPending =
    payTxState.status === "pending" ||
    approveTxState.status === "pending" ||
    subTxState.status === "pending";

  const fetchSubscriptionInfo = useCallback(async () => {
    if (!splitterValid) {
      setSubDurationDays(0n);
      setIsSubscribed(null);
      setSubExpiry(0n);
      return;
    }

    setSubInfoLoading(true);
    try {
      const provider = getReadProvider(selectedNetwork);
      const splitter = new ethers.Contract(trimmedSplitter, SPLITTER_ABI, provider);
      const duration = (await splitter.subscriptionDurationDays()) as bigint;
      setSubDurationDays(duration);

      if (duration > 0n && connectedAddress && isValidAddress(connectedAddress)) {
        const [active, expiry] = await Promise.all([
          splitter.isSubscribed(connectedAddress) as Promise<boolean>,
          splitter.subscriptionExpiry(connectedAddress) as Promise<bigint>,
        ]);
        setIsSubscribed(active);
        setSubExpiry(expiry);
      } else {
        setIsSubscribed(null);
        setSubExpiry(0n);
      }
    } catch {
      setSubDurationDays(0n);
      setIsSubscribed(null);
      setSubExpiry(0n);
    } finally {
      setSubInfoLoading(false);
    }
  }, [splitterValid, trimmedSplitter, connectedAddress, selectedNetwork]);

  useEffect(() => {
    fetchSubscriptionInfo();
  }, [fetchSubscriptionInfo]);

  const fetchTokenMeta = useCallback(async () => {
    if (mode !== "ERC20" || !tokenValid) {
      setTokenMeta(null);
      setTokenError(null);
      return;
    }

    setTokenLoading(true);
    setTokenError(null);
    try {
      const provider = getReadProvider(selectedNetwork);
      const erc20 = new ethers.Contract(trimmedToken, ERC20_ABI, provider);
      const [symbol, decimals] = await Promise.all([
        erc20.symbol().catch(() => "TOKEN") as Promise<string>,
        erc20.decimals() as Promise<number | bigint>,
      ]);

      let balance: bigint | null = null;
      let allowance: bigint | null = null;

      if (connectedAddress && isValidAddress(connectedAddress)) {
        balance = (await erc20.balanceOf(connectedAddress)) as bigint;
        if (splitterValid) {
          allowance = (await erc20.allowance(connectedAddress, trimmedSplitter)) as bigint;
        }
      }

      setTokenMeta({
        symbol,
        decimals: Number(decimals),
        balance,
        allowance,
      });
    } catch (err) {
      setTokenError(extractShortError(err));
      setTokenMeta(null);
    } finally {
      setTokenLoading(false);
    }
  }, [mode, tokenValid, trimmedToken, connectedAddress, splitterValid, selectedNetwork]);

  useEffect(() => {
    fetchTokenMeta();
  }, [fetchTokenMeta]);

  const handlePayEth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!splitterValid || isAnyPending) return;

    let valueWei: bigint;
    try {
      valueWei = ethers.parseEther(ethAmount.trim());
      if (valueWei <= 0n) throw new Error("Amount must be greater than 0");
    } catch {
      setPayTxState({ status: "error", error: "Enter a valid ETH amount greater than 0." });
      return;
    }

    setApproveTxState(INITIAL_TX_STATE);
    setPayTxState({ status: "pending", message: "Confirm ETH payment in wallet…" });

    try {
      const signer = await getWriteSigner(selectedNetwork);
      const splitter = new ethers.Contract(trimmedSplitter, SPLITTER_ABI, signer);
      const refId = encodeRefId(refText.trim());
      const tx = await splitter.payETH(refId, { value: valueWei });

      setPayTxState({
        status: "pending",
        message: "Sending ETH payment…",
        txHash: tx.hash,
      });

      const receipt = await tx.wait();
      setPayTxState({
        status: "success",
        message: `Paid ${ethAmount.trim()} ETH.`,
        txHash: receipt?.hash ?? tx.hash,
      });
      setEthAmount("");
    } catch (err) {
      setPayTxState({ status: "error", error: extractShortError(err) });
    }
  };

  const handlePayToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!splitterValid || !tokenValid || !tokenMeta || isAnyPending) return;

    let parsedAmount: bigint;
    try {
      parsedAmount = ethers.parseUnits(tokenAmount.trim(), tokenMeta.decimals);
      if (parsedAmount <= 0n) throw new Error("Amount must be greater than 0");
    } catch {
      setPayTxState({
        status: "error",
        error: `Enter a valid ${tokenMeta.symbol} amount greater than 0.`,
      });
      return;
    }

    setApproveTxState(INITIAL_TX_STATE);
    setPayTxState(INITIAL_TX_STATE);

    try {
      const signer = await getWriteSigner(selectedNetwork);
      const signerAddress = await signer.getAddress();
      const erc20Write = new ethers.Contract(trimmedToken, ERC20_ABI, signer);
      const erc20Read = new ethers.Contract(trimmedToken, ERC20_ABI, getReadProvider(selectedNetwork));
      const currentAllowance = (await erc20Read.allowance(
        signerAddress,
        trimmedSplitter
      )) as bigint;

      if (currentAllowance < parsedAmount) {
        setApproveTxState({
          status: "pending",
          message: `Step 1/2: Confirm ${tokenMeta.symbol} approval in wallet…`,
        });
        try {
          const approveTx = await erc20Write.approve(trimmedSplitter, parsedAmount);
          setApproveTxState({
            status: "pending",
            message: `Step 1/2: Approving ${tokenMeta.symbol}…`,
            txHash: approveTx.hash,
          });
          const approveReceipt = await approveTx.wait();
          setApproveTxState({
            status: "success",
            message: `Step 1/2: ${tokenMeta.symbol} approved.`,
            txHash: approveReceipt?.hash ?? approveTx.hash,
          });
        } catch (err) {
          setApproveTxState({
            status: "error",
            error: `Step 1/2 Approval failed: ${extractShortError(err)}`,
          });
          return;
        }
      }

      setPayTxState({
        status: "pending",
        message:
          currentAllowance < parsedAmount
            ? `Step 2/2: Confirm ${tokenMeta.symbol} payment in wallet…`
            : `Confirm ${tokenMeta.symbol} payment in wallet…`,
      });

      const splitterWrite = new ethers.Contract(trimmedSplitter, SPLITTER_ABI, signer);
      const refId = encodeRefId(refText.trim());
      const payTx = await splitterWrite.payToken(trimmedToken, parsedAmount, refId);

      setPayTxState({
        status: "pending",
        message:
          currentAllowance < parsedAmount
            ? `Step 2/2: Sending ${tokenMeta.symbol} payment…`
            : `Sending ${tokenMeta.symbol} payment…`,
        txHash: payTx.hash,
      });

      const payReceipt = await payTx.wait();
      setPayTxState({
        status: "success",
        message: `Paid ${tokenAmount.trim()} ${tokenMeta.symbol}.`,
        txHash: payReceipt?.hash ?? payTx.hash,
      });
      setTokenAmount("");
      await fetchTokenMeta();
    } catch (err) {
      setPayTxState({
        status: "error",
        error: extractShortError(err),
      });
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!splitterValid || isAnyPending) return;

    let valueWei: bigint;
    try {
      valueWei = ethers.parseEther(subEthAmount.trim());
      if (valueWei <= 0n) throw new Error("Amount must be greater than 0");
    } catch {
      setSubTxState({ status: "error", error: "Enter a valid ETH amount greater than 0." });
      return;
    }

    setSubTxState({ status: "pending", message: "Confirm subscription in wallet…" });
    try {
      const signer = await getWriteSigner(selectedNetwork);
      const splitter = new ethers.Contract(trimmedSplitter, SPLITTER_ABI, signer);
      const refId = encodeRefId(subRefText.trim());
      const tx = await splitter.subscribe(refId, { value: valueWei });

      setSubTxState({
        status: "pending",
        message: "Processing subscription…",
        txHash: tx.hash,
      });

      const receipt = await tx.wait();
      setSubTxState({
        status: "success",
        message: "Subscription activated.",
        txHash: receipt?.hash ?? tx.hash,
      });
      setSubEthAmount("");
      await fetchSubscriptionInfo();
    } catch (err) {
      setSubTxState({ status: "error", error: extractShortError(err) });
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Pay</h1>
        <p className="text-sm text-zinc-400">
          Send ETH or ERC-20 payments to a splitter contract, or subscribe.
        </p>
      </div>

      {/* Splitter address + Mode toggle */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-5">
        <div className="space-y-2">
          <label htmlFor="pay-splitter" className="block text-sm font-medium text-zinc-200">
            Splitter address
          </label>
          <input
            id="pay-splitter"
            type="text"
            value={splitterInput}
            disabled={isAnyPending}
            onChange={(e) => setSplitterInput(e.target.value)}
            placeholder="0x… splitter address"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className={`h-12 w-full rounded-xl border bg-zinc-950 px-3.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50 ${
              trimmedSplitter.length > 0 && !splitterValid
                ? "border-red-500/60 focus:border-red-400"
                : "border-zinc-800 focus:border-blue-500"
            }`}
          />
          {trimmedSplitter.length > 0 && !splitterValid ? (
            <p className="text-xs text-red-400">Invalid splitter address</p>
          ) : null}
        </div>

        {/* ETH / ERC-20 Segmented Toggle */}
        <div
          role="group"
          aria-label="Payment asset type"
          className="grid grid-cols-2 gap-1 rounded-xl border border-zinc-800 bg-zinc-950 p-1"
        >
          <button
            type="button"
            disabled={isAnyPending}
            onClick={() => {
              setMode("ETH");
              setApproveTxState(INITIAL_TX_STATE);
              setPayTxState(INITIAL_TX_STATE);
            }}
            className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
              mode === "ETH"
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            ETH
          </button>
          <button
            type="button"
            disabled={isAnyPending}
            onClick={() => {
              setMode("ERC20");
              setApproveTxState(INITIAL_TX_STATE);
              setPayTxState(INITIAL_TX_STATE);
            }}
            className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
              mode === "ERC20"
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            ERC-20
          </button>
        </div>

        {mode === "ETH" ? (
          <form onSubmit={handlePayEth} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="pay-eth-amount" className="block text-sm font-medium text-zinc-200">
                Amount (ETH)
              </label>
              <input
                id="pay-eth-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={ethAmount}
                disabled={isAnyPending}
                onChange={(e) => setEthAmount(e.target.value)}
                placeholder="0.01"
                className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 font-mono text-sm tabular-nums text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="pay-ref" className="block text-sm font-medium text-zinc-200">
                Reference (optional)
              </label>
              <input
                id="pay-ref"
                type="text"
                value={refText}
                disabled={isAnyPending}
                onChange={(e) => setRefText(e.target.value)}
                placeholder="Invoice ID or note"
                className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            {!connectedAddress ? (
              <button
                type="button"
                disabled={isConnecting || isAnyPending}
                onClick={connect}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {isConnecting ? "Connecting…" : "Connect Wallet to Pay"}
              </button>
            ) : (
              <button
                type="submit"
                disabled={!splitterValid || !ethAmount.trim() || isAnyPending}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                <Coins className="h-4 w-4" aria-hidden="true" />
                {payTxState.status === "pending" ? "Sending…" : "Pay ETH"}
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={handlePayToken} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="pay-token-addr" className="block text-sm font-medium text-zinc-200">
                Token address
              </label>
              <input
                id="pay-token-addr"
                type="text"
                value={tokenInput}
                disabled={isAnyPending}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="0x… ERC-20 token address"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                className={`h-12 w-full rounded-xl border bg-zinc-950 px-3.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50 ${
                  trimmedToken.length > 0 && !tokenValid
                    ? "border-red-500/60 focus:border-red-400"
                    : "border-zinc-800 focus:border-blue-500"
                }`}
              />
              {trimmedToken.length > 0 && !tokenValid ? (
                <p className="text-xs text-red-400">Invalid token address</p>
              ) : null}
              {tokenLoading ? (
                <p className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Loading token info…
                </p>
              ) : tokenError ? (
                <p className="text-xs text-red-400">{tokenError}</p>
              ) : tokenMeta ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                  <span>
                    Token: <span className="font-mono text-zinc-200">{tokenMeta.symbol}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Decimals: {tokenMeta.decimals}</span>
                  {tokenMeta.balance !== null ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        Bal: {ethers.formatUnits(tokenMeta.balance, tokenMeta.decimals)}
                      </span>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="pay-token-amount" className="block text-sm font-medium text-zinc-200">
                Amount {tokenMeta ? `(${tokenMeta.symbol})` : ""}
              </label>
              <input
                id="pay-token-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={tokenAmount}
                disabled={isAnyPending}
                onChange={(e) => setTokenAmount(e.target.value)}
                placeholder="100"
                className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 font-mono text-sm tabular-nums text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="pay-token-ref" className="block text-sm font-medium text-zinc-200">
                Reference (optional)
              </label>
              <input
                id="pay-token-ref"
                type="text"
                value={refText}
                disabled={isAnyPending}
                onChange={(e) => setRefText(e.target.value)}
                placeholder="Invoice ID or note"
                className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            {!connectedAddress ? (
              <button
                type="button"
                disabled={isConnecting || isAnyPending}
                onClick={connect}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {isConnecting ? "Connecting…" : "Connect Wallet to Pay"}
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  !splitterValid ||
                  !tokenValid ||
                  !tokenMeta ||
                  !tokenAmount.trim() ||
                  isAnyPending
                }
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                <Coins className="h-4 w-4" aria-hidden="true" />
                {isAnyPending ? "Processing…" : `Pay ${tokenMeta?.symbol ?? "Token"}`}
              </button>
            )}
          </form>
        )}
      </div>

      {/* Both step statuses rendered cleanly */}
      {approveTxState.status !== "idle" ? <TxStatus state={approveTxState} /> : null}
      {payTxState.status !== "idle" ? <TxStatus state={payTxState} /> : null}

      {/* Subscription section shown when splitter has subscriptionDurationDays > 0 */}
      {splitterValid && subInfoLoading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Checking subscription settings…
        </div>
      ) : null}

      {splitterValid && subDurationDays > 0n ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-400" aria-hidden="true" />
              <h2 className="text-base font-semibold text-zinc-50">Subscribe</h2>
            </div>
            <span className="font-mono text-xs tabular-nums text-zinc-400">
              Term: {subDurationDays.toString()} days
            </span>
          </div>

          {connectedAddress ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-400">Your status</span>
                {isSubscribed ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-300">
                    <XCircle className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                    Expired
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-400">Expiry date</span>
                <span className="font-mono tabular-nums text-zinc-200">
                  {formatTimestamp(subExpiry)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-400">
              Connect your wallet to view your subscription status and subscribe.
            </p>
          )}

          <form onSubmit={handleSubscribe} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="sub-eth-amount" className="block text-sm font-medium text-zinc-200">
                Subscription amount (ETH)
              </label>
              <input
                id="sub-eth-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={subEthAmount}
                disabled={isAnyPending}
                onChange={(e) => setSubEthAmount(e.target.value)}
                placeholder="0.01"
                className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 font-mono text-sm tabular-nums text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sub-ref" className="block text-sm font-medium text-zinc-200">
                Reference (optional)
              </label>
              <input
                id="sub-ref"
                type="text"
                value={subRefText}
                disabled={isAnyPending}
                onChange={(e) => setSubRefText(e.target.value)}
                placeholder="Member handle or note"
                className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            {!connectedAddress ? (
              <button
                type="button"
                disabled={isConnecting || isAnyPending}
                onClick={connect}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {isConnecting ? "Connecting…" : "Connect Wallet to Subscribe"}
              </button>
            ) : (
              <button
                type="submit"
                disabled={!subEthAmount.trim() || isAnyPending}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                {subTxState.status === "pending" ? "Subscribing…" : "Subscribe"}
              </button>
            )}
          </form>

          <TxStatus state={subTxState} />
        </section>
      ) : null}
    </div>
  );
}
