import { signIn, signOut, useSession } from "next-auth/react";
import useSWR from "swr";
import { useMemo, useState, useEffect, useRef } from "react";
import { computePortfolio, type Tx } from "@/lib/pnl";
const fetcher = (url: string) => fetch(url).then((r) => r.json());
export default function Home() {
    const { data: session } = useSession();
    if (!session) {
        return (<div className="container">
            <h1>Crypto Portfolio Tracker</h1>
            <p>Sign in with Google to get started.</p>
            <button className="btn" onClick={() => signIn("google")}>Sign in with Google</button>      </div>);
    } return <Dashboard />;
}

function Dashboard() {
    const { data: session } = useSession();
    const { data: txs, mutate } = useSWR(session ? "/api/transactions" : null, fetcher, {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        refreshInterval: 0,
        // Prevent initial auto fetch; will load on explicit mutate()
        revalidateOnMount: false as any,
        revalidateIfStale: false as any,
    });
    const { data: conn, mutate: mutateConn } = useSWR(session ? "/api/connections/bitvavo" : null, fetcher);
    const [vals, setVals] = useState<{
        valuations: Array<{ symbol: string; available: number; inOrder: number; priceEUR: number; change24h: number; change24hPct: number; valueInOrderEUR: number; valueTotalEUR: number }>;
        totals: { valueAvailableEUR: number; valueInOrderEUR: number; valueTotalEUR: number }; timeframe?: string
    } | null>(null);

    const [timeframe, setTimeframe] = useState<'1D' | '1W' | '1M' | 'YTD' | '1Y' | 'Max'>('1D');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [edit, setEdit] = useState<any>({});
    const [txSearch, setTxSearch] = useState("");
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const userMenuRef = useRef<HTMLDivElement | null>(null);
    const [portfolioHistory, setPortfolioHistory] = useState<Array<{ date: string; value: number }>>([]);

    // Connect Bitvavo modal state
    const [showConnect, setShowConnect] = useState(false);
    const [apiForm, setApiForm] = useState({ label: "", apiKey: "", apiSecret: "" });

    const portfolio = useMemo(() => {
        const baseTxs = (txs ?? []) as any[];
        const txList: Tx[] = baseTxs.map((t: any) => ({ assetSymbol: t.assetSymbol, type: t.type, quantity: Number(t.quantity), pricePerUnit: Number(t.pricePerUnit), fee: Number(t.fee ?? 0), timestamp: t.timestamp }));

        // Derive quote-currency flows so cash/stablecoin balances reflect spending/proceeds
        // BUY: subtract quote currency (SELL of quote for paidAmount)
        // SELL: add quote currency (BUY of quote for proceeds)
        const quoteTxs: Tx[] = [];
        for (const t of baseTxs) {
            const q = String(t.quoteCurrency || '').toUpperCase();
            if (!q) continue;
            const qty = Number(t.quantity) || 0;
            const ppu = Number(t.pricePerUnit) || 0;
            const fee = Number(t.fee || 0);
            const paid = qty * ppu + fee;
            const proceeds = qty * ppu - fee;
            if (t.type === 'BUY') {
                if (paid > 0) quoteTxs.push({ assetSymbol: q, type: 'SELL', quantity: paid, pricePerUnit: 1, fee: 0, timestamp: t.timestamp });
            } else if (t.type === 'SELL') {
                if (proceeds > 0) quoteTxs.push({ assetSymbol: q, type: 'BUY', quantity: proceeds, pricePerUnit: 1, fee: 0, timestamp: t.timestamp });
            }
        }
        const allTxs: Tx[] = [...txList, ...quoteTxs];

        const symbols = Array.from(new Set(allTxs.map((t) => t.assetSymbol)));
        // Prefer live Bitvavo EUR prices when available
        const fromApi = new Map<string, number>();
        if (vals?.valuations?.length) {
            for (const v of vals.valuations) fromApi.set(v.symbol, Number(v.priceEUR) || 0);
        }
        const priceMap: Record<string, number> = symbols.reduce((acc, s) => {
            acc[s] = fromApi.get(s) ?? 0;
            return acc;
        }, {} as Record<string, number>);
        return computePortfolio(allTxs, priceMap);
    }, [txs, vals]);

    // Auto-refresh Bitvavo valuations (incl. EUR) every few seconds when connected
    useEffect(() => {
        if (!conn?.connected) return;
        let stopped = false;
        let timer: any;
        const refresh = async () => {
            try {
                await syncBitvavoWithPrices(timeframe);
            } finally {
                if (!stopped) timer = setTimeout(refresh, 20000); // ~20s cadence
            }
        };
        refresh();
        return () => {
            stopped = true;
            if (timer) clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conn?.connected, timeframe]);

    // Close user menu on outside click or Escape key
    useEffect(() => {
        function onInteract(e: MouseEvent | TouchEvent) {
            if (!userMenuOpen) return;
            const el = userMenuRef.current;
            if (!el) return;
            if (el.contains(e.target as Node)) return;
            setUserMenuOpen(false);
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setUserMenuOpen(false);
        }
        document.addEventListener('mousedown', onInteract);
        document.addEventListener('touchstart', onInteract);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onInteract);
            document.removeEventListener('touchstart', onInteract);
            document.removeEventListener('keydown', onKey);
        };
    }, [userMenuOpen]);

    const combined = useMemo(() => {
        const apiMap = new Map<string, any>();
        for (const v of vals?.valuations ?? []) apiMap.set(v.symbol, v);
        const txMap = new Map<string, any>();
        for (const a of portfolio.assets) txMap.set(a.symbol, a);
        const symbols = Array.from(new Set([...(apiMap.keys()), ...(txMap.keys())]));
        return symbols.map((sym) => {
            const v = apiMap.get(sym);
            const a = txMap.get(sym);
            const qtyTx = a?.quantityHeld ?? 0;
            const qtyApiAvail = v?.available ?? 0;
            const qtyApiInOrder = v?.inOrder ?? 0;
            const price = v?.priceEUR ?? 0;
            const valueTx = qtyTx * price;
            const positionValue = (v?.valueTotalEUR ?? (qtyApiAvail + qtyApiInOrder) * price) || valueTx || 0;
            const totalBuyIn = a?.totalCostBasis ?? 0;
            const unreal = a?.unrealizedPnL ?? 0;
            const realized = a?.realizedPnL ?? 0;
            const unrealPnlPct = totalBuyIn > 0 ? (unreal / totalBuyIn) * 100 : 0;
            const totalPnl = (unreal || 0) + (realized || 0);
            const totalPnlPct = totalBuyIn > 0 ? (totalPnl / totalBuyIn) * 100 : 0;
            return {
                symbol: sym,
                qtyTx,
                qtyApiAvail,
                qtyApiInOrder,
                priceEUR: price,
                change24h: v?.change24h ?? 0,
                change24hPct: v?.change24hPct ?? 0,
                avgBuyIn: a?.avgCostBasisPerUnit ?? 0,
                totalBuyIn,
                unrealized: unreal,
                unrealizedPct: unrealPnlPct,
                realized: realized,
                totalPnl,
                totalPnlPct,
                valueTx,
                valueApi: v?.valueTotalEUR ?? 0,
                positionValue,
            };
        }).sort((x, y) => (y.valueApi || y.valueTx) - (x.valueApi || x.valueTx));
    }, [vals, portfolio]);


    // Portfolio side summary stats
    const sideStats = useMemo(() => {
        const invested = Number(portfolio?.totals?.totalCostBasis || 0);
        const priceGain = Number(portfolio?.totals?.unrealizedPnL || 0);
        const realizedGain = Number(portfolio?.totals?.realizedPnL || 0);
        let dividends = 0;
        let txCosts = 0;
        for (const t of (txs ?? []) as any[]) {
            txCosts += Number(t.fee || 0);
            if (String(t.type) === 'STAKING_REWARD') {
                dividends += Number(t.quantity || 0) * Number(t.pricePerUnit || 0);
            }
        }
        const taxes = 0;
        const totalReturn = priceGain + realizedGain + dividends - txCosts - taxes;
        const pct = (n: number) => (invested > 0 ? (n / invested) * 100 : 0);
        return {
            invested,
            priceGain,
            priceGainPct: pct(priceGain),
            dividends,
            dividendsPct: pct(dividends),
            realizedGain,
            realizedGainPct: pct(realizedGain),
            txCosts,
            taxes,
            totalReturn,
            totalReturnPct: pct(totalReturn),
        };
    }, [portfolio, txs]);

    async function syncBitvavoWithPrices(tf = timeframe) {
        const res = await fetch(`/api/bitvavo/valuations?timeframe=${encodeURIComponent(tf.toLowerCase())}`);
        const data = await res.json(); if (res.ok) setVals(data);
    }

    async function importAndSync() {
        try {
            const res = await fetch('/api/transactions/import-bitvavo', { method: 'POST' });
            const e = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(e?.error || res.statusText);
            await mutate();
        } catch (err: any) {
            alert('Import failed: ' + (err?.message || 'Unknown error'));
            return;
        }
        try {
            await syncBitvavoWithPrices(timeframe);
        } catch (err: any) {
            alert('Sync failed: ' + (err?.message || 'Unknown error'));
        }
    }

    async function disconnectApi() {
        if (!confirm('Disconnect Bitvavo API? This will not delete your transactions.')) return;
        const res = await fetch('/api/connections/bitvavo', { method: 'DELETE' });
        if (res.ok) {
            setVals(null);
            // Clear any external items from tx cache and refresh
            mutate((curr: any) => Array.isArray(curr) ? curr.filter((t: any) => !String(t.id || '').startsWith('ext:')) : curr, { revalidate: false } as any);
            await Promise.all([mutateConn(), mutate()]);
        } else {
            const e = await res.json().catch(() => ({}));
            alert('Disconnect failed: ' + (e?.error || res.statusText));
        }
    }

    async function connectBitvavo(e: React.FormEvent) {
        e.preventDefault();
        const payload = {
            apiKey: apiForm.apiKey.trim(),
            apiSecret: apiForm.apiSecret.trim(),
            label: apiForm.label.trim() || undefined,
        } as any;
        if (!payload.apiKey || !payload.apiSecret) {
            alert('Please provide API Key and Secret');
            return;
        }
        const res = await fetch('/api/connections/bitvavo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (res.ok) {
            setShowConnect(false);
            setApiForm({ label: '', apiKey: '', apiSecret: '' });
            await mutateConn();
            await importAndSync();
            // await syncBitvavoWithPrices(timeframe);
        } else {
            const ejson = await res.json().catch(() => ({}));
            alert('Connect failed: ' + (ejson?.error || res.statusText));
        }
    }

    // Import-only and clear-all transaction buttons removed; using Import + Sync instead

    async function saveEdit() {
        if (!editingId) return;
        const tx = (txs ?? []).find((x: any) => String(x.id) === String(editingId));
        const merged = {
            assetSymbol: (edit.assetSymbol ?? tx?.assetSymbol ?? '').toString().toUpperCase(),
            type: (edit.type ?? tx?.type ?? 'BUY'),
            quantity: Number(edit.quantity ?? tx?.quantity ?? 0),
            pricePerUnit: Number(edit.pricePerUnit ?? tx?.pricePerUnit ?? 0),
            fee: Number(edit.fee ?? tx?.fee ?? 0),
            quoteCurrency: (edit.quoteCurrency ?? tx?.quoteCurrency ?? 'EUR').toString().toUpperCase(),
            timestamp: new Date(edit.timestamp ?? tx?.timestamp ?? Date.now()),
            note: (edit.note ?? tx?.note ?? '') || null,
        } as any;
        const payload: any = { ...merged };
        // Preserve linkage: edit DB row by id, or create/overwrite override by externalId
        if (String(editingId).startsWith('ext:')) {
            payload.externalId = (tx?.externalId ?? String(editingId).slice(4));
        } else {
            payload.id = editingId;
        }
        const res = await fetch('/api/transactions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
            setEditingId(null); setEdit({}); mutate();
        } else {
            const e = await res.json().catch(() => ({}));
            alert('Save failed: ' + (e?.error || res.statusText));
        }
    }

    return (
        <div className="container">
            <div className="row" style={{ justifyContent: "space-between" }}>
                <h1 style={{fontWeight:700, fontSize:24}}>Dashboard</h1>
                <div className="row">
                    <button className="btn" onClick={importAndSync} disabled={!conn?.connected} style={{ background: !conn?.connected ? '#a5a5a5ff' : '#111' }}>Sync</button>
                    <div style={{ position: 'relative' }} ref={userMenuRef}>
                        <button className="btn secondary" onClick={() => setUserMenuOpen((v) => !v)}>
                            {(useSession().data?.user?.email) ?? "Account"} ▾
                        </button>
                        {userMenuOpen ? (
                            <div className="card" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', minWidth: 220, padding: 8 }}>
                                {conn?.connected ? (
                                    <button className="btn secondary" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { setUserMenuOpen(false); disconnectApi(); }}>
                                        Disconnect API
                                    </button>
                                ) : null}
                                <button className="btn" style={{ width: '100%', justifyContent: 'flex-start', marginTop: 8 }} onClick={() => { setUserMenuOpen(false); signOut(); }}>
                                    Sign out
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
            {/* <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'stretch', gap: 16 }}> */} 
            <div className="flex flex-col-reverse md:flex-row items-start justify-stretch gap-4"> 
                {/* Left column: Chart + Positions */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="card">
                        <h3 style={{fontWeight:700, fontSize: 24}}>Positions (Combined)</h3>
                        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                            
                            <div className="row" style={{ alignItems: 'center', gap: 12 }}>
                                {!conn?.connected ? (
                                    <button className="btn" onClick={() => setShowConnect(true)}>Add API</button>
                                ) : null}
                            </div>
                        </div>
                        <div className="cards">
                            {combined.length === 0 ? (
                                <div className="card-row"><div className="left"><div className="sub">No data available</div></div></div>
                            ) : null}
                            {combined.map((c: any) => (
                                <div className="card-row flex flex-col lg:flex-row justify-between gap-4" key={c.symbol}>
                                    <div className="left self-start">
                                        <div className="sym"><i className={`cf cf-${c.symbol.toLowerCase()}`}></i> {c.symbol}</div>
                                        <div className="sub">x{c.qtyApiAvail + c.qtyApiInOrder} • In Orders: {c.qtyApiInOrder}</div>
                                        {/* <div className="sub">Qty (TX): {c.qtyTx} • Qty (API): {c.qtyApiAvail + c.qtyApiInOrder} • In Orders: {c.qtyApiInOrder}</div> */}
                                    </div>
                                    <div className="right flex flex-row gap-0 lg:gap-4 items-end self-end">
                                        <div className="flex flex-col items-end cell">
                                            <div className="label">Total Buy-in</div>
                                            <div className="value">€{c.totalBuyIn?.toLocaleString?.() ?? c.totalBuyIn}</div>
                                            {/* <div className="label">Price</div> */}
                                            <div className="sub">Price: €{c.priceEUR.toLocaleString()}</div>
                                        </div>
                                        <div className="flex flex-col items-end cell">
                                            <div className="label">Unrealized PnL</div>
                                            <div className="value" style={{ color: (c.unrealized || 0) >= 0 ? '#059669' : '#dc2626' }}>{(c.unrealized || 0) >= 0 ? '+' : ''}€{(c.unrealized || 0).toLocaleString()}</div>
                                            <div className="sub" style={{ color: (c.unrealizedPct || 0) >= 0 ? '#059669' : '#dc2626' }}>{(c.unrealizedPct || 0) >= 0 ? '+' : ''}{(c.unrealizedPct || 0).toFixed(2)}%</div>
                                        </div>
                                        {/* <div className="cell">
                                    <div className="label">Avg Buy-in</div>
                                    <div className="value">€{c.avgBuyIn}</div>
                                    </div> */}
                                        <div className="cell" style={{ display: 'none' }}>
                                            <div className="label">Unrealized</div>
                                            <div className="value" style={{ color: c.unrealized >= 0 ? '#059669' : '#dc2626' }}>{c.unrealized >= 0 ? '+' : ''}€{(c.unrealized || 0).toLocaleString()}</div>
                                        </div>
                                        <div className="cell" style={{ display: 'none' }}>
                                            <div className="label">Realized</div>
                                            <div className="value" style={{ color: c.realized >= 0 ? '#059669' : '#dc2626' }}>{c.realized >= 0 ? '+' : ''}€{(c.realized || 0).toLocaleString()}</div>
                                        </div>
                                        <div className="cell" style={{ display: 'none' }}>
                                            <div className="label">Value (TX)</div>
                                            <div className="value">€{(c.valueTx || 0).toLocaleString()}</div>
                                        </div>
                                        <div className="flex flex-col items-end cell" >
                                            <div className="label">Value (API)</div>
                                            <div className="value">€{(c.valueApi || 0).toLocaleString()}</div>
                                            <div className="sub">Avg Buy In: €{c.avgBuyIn.toLocaleString()}</div>

                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                {/* Side menu with fixed width */}
                {/* <div style={{ width: 320, flex: '0 0 320px' }}> */}
                <div className="w-full md:w-80 flex-shrink-0">
                    <div className="card">
                        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 24 }}>Portfolio</div>
                        <div className="row" style={{ gap: 16, marginBottom: 8 }}>
                            <div>
                                <div className="sub" style={{ fontWeight: 700 }}>Value</div>
                                <div>€{(vals?.totals?.valueTotalEUR ?? portfolio.totals.marketValue).toLocaleString()}</div>
                            </div>
                            <div>
                                <div className="sub" style={{ fontWeight: 700 }}>Buy In</div>
                                <div>€{portfolio.totals.totalCostBasis.toLocaleString()}</div>
                            </div>
                        </div>
                        <div className="row" style={{ gap: 16 }}>
                            <div>
                                <div className="sub" style={{ fontWeight: 700 }}>Unrealized</div>
                                <div style={{ color: (portfolio.totals.unrealizedPnL || 0) >= 0 ? '#059669' : '#dc2626' }}>
                                    {(portfolio.totals.unrealizedPnL || 0) >= 0 ? '↗ ' : '↘ '}€{portfolio.totals.unrealizedPnL.toLocaleString()}
                                </div>
                            </div>
                            <div>
                                <div className="sub" style={{ fontWeight: 700 }}>Realized</div>
                                <div style={{ color: (portfolio.totals.realizedPnL || 0) >= 0 ? '#059669' : '#dc2626' }}>
                                    {(portfolio.totals.realizedPnL || 0) >= 0 ? '↗ ' : '↘ '}€{portfolio.totals.realizedPnL.toLocaleString()}
                                </div>
                            </div>
                        </div>
                        <div style={{ borderTop: '1px solid #e5e7eb', margin: '12px 0' }} />
                    
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Capital</div>
                        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                            <div>Invested capital</div>
                            <div>€{sideStats.invested.toLocaleString()}</div>
                        </div>
                        <div style={{ fontWeight: 700, margin: '12px 0 8px' }}>Performance Breakdown</div>
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                            <div>Price gain</div>
                            <div style={{ textAlign: 'right' }}>
                                <div>€{sideStats.priceGain.toLocaleString()}</div>
                                <div style={{ color: sideStats.priceGain >= 0 ? '#059669' : '#dc2626' }}>
                                    {sideStats.priceGain >= 0 ? '↗ ' : '↘ '}{sideStats.priceGainPct.toFixed(2)}%
                                </div>
                            </div>
                        </div>
                        <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                            <div>Realized gain</div>
                            <div style={{ textAlign: 'right' }}>
                                <div>€{sideStats.realizedGain.toLocaleString()}</div>
                                <div style={{ color: sideStats.realizedGain >= 0 ? '#059669' : '#dc2626' }}>
                                    {sideStats.realizedGain >= 0 ? '↗ ' : '↘ '}{sideStats.realizedGainPct.toFixed(2)}%
                                </div>
                            </div>
                        </div>
                        <div style={{ borderTop: '1px solid #e5e7eb', margin: '12px 0' }} />
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                            <div style={{ fontWeight: 700 }}>Total return</div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: sideStats.totalReturn >= 0 ? '#059669' : '#dc2626', fontWeight: 700 }}>
                                    {sideStats.totalReturn >= 0 ? '↗ ' : '↘ '}{sideStats.totalReturnPct.toFixed(2)}%
                                </div>
                                <div style={{ fontWeight: 700 }}>{sideStats.totalReturn >= 0 ? '+' : '-'}€{sideStats.totalReturn.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* Transactions table with edit capability */}
            <div className="card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                    <h3>Transactions</h3>
                    <div className="row">
                        <input placeholder="Search coin (e.g. BTC)" value={txSearch} onChange={(e) => setTxSearch(e.target.value)} style={{ minWidth: 220 }} />
                    </div>
                </div>
                <table className="pretty">
                    <thead>
                        <tr>
                            {/* <th>ID</th> */}
                            <th>Time</th>
                            <th>Action</th>
                            <th>Bought</th>
                            <th>Paid</th>
                            <th>Price</th>
                            <th>Fee</th>
                            <th>Note</th>
                            <th>Source</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {(txs ?? [])
                            .filter((t: any) => !txSearch || (t.assetSymbol || '').toLowerCase().includes(txSearch.toLowerCase()))
                            .slice()
                            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .map((t: any) => {
                                const paidAmount = Number(t.quantity) * Number(t.pricePerUnit) + Number(t.fee || 0);
                                if (editingId === t.id) {
                                    return (
                                        <tr key={t.id}>
                                            {/* <td>{t.id}</td> */}
                                            <td><input type="datetime-local" value={new Date(edit.timestamp ?? t.timestamp).toISOString().slice(0, 16)} onChange={(e) => setEdit({ ...edit, timestamp: e.target.value })} /></td>
                                            <td>
                                                <select value={(edit.type ?? t.type)} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
                                                    <option>BUY</option>
                                                    <option>SELL</option>
                                                    <option>TRANSFER_IN</option>
                                                    <option>TRANSFER_OUT</option>
                                                    <option>DEPOSIT</option>
                                                    <option>STAKING_REWARD</option>
                                                </select>
                                            </td>
                                            <td>
                                                <div className="row">
                                                    <input style={{ width: 30 }} type="text" value={(edit.assetSymbol ?? t.assetSymbol)} onChange={(e) => setEdit({ ...edit, assetSymbol: e.target.value })} />
                                                    <input style={{ width: 90 }} type="number" step="0.00000001" value={(edit.quantity ?? t.quantity)} onChange={(e) => setEdit({ ...edit, quantity: Number(e.target.value) })} />
                                                </div>
                                            </td>
                                            <td>
                                                <div className="row">
                                                    <input style={{ width: 30 }} type="text" value={(edit.quoteCurrency ?? t.quoteCurrency)} onChange={(e) => setEdit({ ...edit, quoteCurrency: e.target.value })} />
                                                    <input style={{ width: 90 }} type="number" step="0.01" value={(edit.pricePerUnit ?? t.pricePerUnit)} onChange={(e) => setEdit({ ...edit, pricePerUnit: Number(e.target.value) })} />
                                                </div>
                                            </td>
                                            <td>{(edit.pricePerUnit ?? t.pricePerUnit)}</td>
                                            <td><input style={{ width: 30 }} type="number" step="0.01" value={(edit.fee ?? t.fee)} onChange={(e) => setEdit({ ...edit, fee: Number(e.target.value) })} /></td>
                                            <td><input style={{ width: 40 }} type="text" value={(edit.note ?? t.note ?? '')} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></td>
                                            <td>{t.source ?? 'manual'}</td>
                                            <td>
                                                <div className="row">
                                                    <button className="btn" onClick={(e) => { e.preventDefault(); saveEdit(); }}>Save</button>
                                                    <button className="btn secondary" onClick={(e) => { e.preventDefault(); setEditingId(null); setEdit({}); }}>Cancel</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }
                                return (
                                    <tr key={t.id}>
                                        {/* <td>{t.id}</td> */}
                                        <td>{new Date(t.timestamp).toLocaleString()}</td>
                                        <td>{t.type}</td>
                                        <td>{t.quantity} {t.assetSymbol}</td>
                                        <td>{paidAmount.toFixed(2)} {t.quoteCurrency}</td>
                                        <td>{t.pricePerUnit}</td>
                                        <td>{t.fee}</td>
                                        <td>{t.note ?? ''}</td>
                                        <td>{t.source ?? 'manual'}{t.userEdited ? ' • edited' : ''}</td>
                                        <td><button className="btn secondary" onClick={(e) => { e.preventDefault(); setEditingId(t.id); setEdit({ externalId: t.externalId, assetSymbol: t.assetSymbol, type: t.type, quantity: t.quantity, quoteCurrency: t.quoteCurrency, pricePerUnit: t.pricePerUnit, fee: t.fee, timestamp: t.timestamp, note: t.note ?? '' }); }}>Edit</button></td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>
            {showConnect ? (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                    <div className="card" style={{ maxWidth: '90%', padding: 16, background: 'white' }}>
                        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                            <h3>Connect Bitvavo API</h3>
                            <button className="btn secondary" onClick={() => setShowConnect(false)}>Close</button>
                        </div>
                        <form onSubmit={connectBitvavo} className="column" style={{ gap: 8 }}>
                            <input placeholder="Label (optional)" value={apiForm.label} onChange={(e) => setApiForm({ ...apiForm, label: e.target.value })} />
                            <input placeholder="API Key" value={apiForm.apiKey} onChange={(e) => setApiForm({ ...apiForm, apiKey: e.target.value })} required />
                            <input placeholder="API Secret" value={apiForm.apiSecret} onChange={(e) => setApiForm({ ...apiForm, apiSecret: e.target.value })} required />
                            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                                <button type="submit" className="btn">Connect</button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>);
}