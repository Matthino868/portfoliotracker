import { signIn, signOut, useSession } from "next-auth/react";
import useSWR from "swr";
import { useMemo, useState, useEffect } from "react";
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
    const [bv, setBv] = useState<{ balances: Array<{ symbol: string; available: string; inOrder: string }> } | null>(null);
    const [vals, setVals] = useState<{
        valuations: Array<{ symbol: string; available: number; inOrder: number; priceEUR: number; change24h: number; change24hPct: number; valueInOrderEUR: number; valueTotalEUR: number }>;
        totals: { valueAvailableEUR: number; valueInOrderEUR: number; valueTotalEUR: number }; timeframe?: string
    } | null>(null);

    const [timeframe, setTimeframe] = useState<'1D' | '1W' | '1M' | 'YTD' | '1Y' | 'Max'>('1D');
    const [search, setSearch] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [edit, setEdit] = useState<any>({});
    const [txSearch, setTxSearch] = useState("");

    const portfolio = useMemo(() => {
        const txList: Tx[] = (txs ?? []).map((t: any) => ({ assetSymbol: t.assetSymbol, type: t.type, quantity: Number(t.quantity), pricePerUnit: Number(t.pricePerUnit), fee: Number(t.fee ?? 0), timestamp: t.timestamp, }));
        const symbols = Array.from(new Set(txList.map((t) => t.assetSymbol)));
        // Prefer live Bitvavo EUR prices when available
        const fromApi = new Map<string, number>();
        if (vals?.valuations?.length) {
            for (const v of vals.valuations) fromApi.set(v.symbol, Number(v.priceEUR) || 0);
        }
        const defaults = { BTC: 60000, ETH: 3000, SOL: 150 } as Record<string, number>;
        const priceMap: Record<string, number> = symbols.reduce((acc, s) => {
            acc[s] = fromApi.get(s) ?? (defaults as any)[s] ?? 0;
            return acc;
        }, {} as Record<string, number>);
        return computePortfolio(txList, priceMap);
    }, [txs, vals]);

    // Auto-fetch Bitvavo valuations (incl. EUR) when connected
    useEffect(() => {
        if (conn?.connected) {
            syncBitvavoWithPrices(timeframe);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conn?.connected]);

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

    // async function addTx(e: React.FormEvent) {
    //     e.preventDefault();
    //     const payload = { assetSymbol: form.assetSymbol.toUpperCase(), type: form.type, quantity: Number(form.quantity), pricePerUnit: Number(form.pricePerUnit), fee: Number(form.fee || 0), timestamp: new Date(form.timestamp), note: form.note || undefined, };
    //     const res = await fetch("/api/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), }); if (res.ok) mutate();
    // }

    async function saveBitvavo(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const payload = { apiKey: String(fd.get("apiKey") || ""), apiSecret: String(fd.get("apiSecret") || ""), label: String(fd.get("label") || "") || undefined, };
        const res = await fetch("/api/connections/bitvavo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (res.ok) mutateConn();
    }

    async function syncBitvavo() {
        const res = await fetch("/api/bitvavo/balances"); const data = await res.json(); if (res.ok) setBv(data);
    }

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

    async function importBitvavoTx() {
        const res = await fetch('/api/transactions/import-bitvavo', { method: 'POST' });
        if (res.ok) {
            await mutate();
        } else {
            const e = await res.json().catch(() => ({}));
            alert('Import failed: ' + (e?.error || res.statusText));
        }
    }

    async function clearAllTransactions() {
        if (!confirm('This will permanently delete all saved transactions. Continue?')) return;
        const res = await fetch('/api/transactions', { method: 'DELETE' });
        if (res.ok) {
            await mutate();
        } else {
            const e = await res.json().catch(() => ({}));
            alert('Clear failed: ' + (e?.error || res.statusText));
        }
    }

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
                <h1>Dashboard</h1>
                <div className="row">
                    <button className="btn" onClick={importAndSync} style={{ marginRight: 12 }}>Import + Sync (Bitvavo)</button>
                    <span>{(useSession().data?.user?.email) ?? ""}</span>
                    <button className="btn secondary" onClick={() => signOut()}>Sign out</button>
                </div>
            </div>
            <div className="card">
                <h3>Portfolio Summary</h3>
                <div className="row" style={{ gap: 24 }}>
                    <div><strong>Value</strong>
                        <div>
                            €{(vals?.totals?.valueTotalEUR ?? portfolio.totals.marketValue).toLocaleString()}
                        </div>
                    </div>
                    <div><strong>Buy In</strong>
                        <div>
                            €{portfolio.totals.totalCostBasis.toLocaleString()}
                        </div>
                    </div>
                    <div><strong>Unrealized PnL</strong>
                        <div style={{ color: (portfolio.totals.unrealizedPnL || 0) >= 0 ? '#059669' : '#dc2626' }}>
                            {(portfolio.totals.unrealizedPnL || 0) >= 0 ? '+' : ''}€{portfolio.totals.unrealizedPnL.toLocaleString()}
                        </div>
                    </div>
                    <div>
                        <strong>Realized PnL</strong>
                        <div style={{ color: (portfolio.totals.realizedPnL || 0) >= 0 ? '#059669' : '#dc2626' }}>
                            {(portfolio.totals.realizedPnL || 0) >= 0 ? '+' : ''}€{portfolio.totals.realizedPnL.toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>
            <div className="card">
                <h3>Positions (Combined)</h3>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                    <input placeholder="Search coin (e.g. BTC)" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220 }} />
                    <div style={{ color: '#6b7280', fontSize: 12 }}>
                        Qty (TX) is from transactions • Qty (API) + In Orders from Bitvavo
                    </div>
                </div>
                <div className="cards">
                    {combined.filter((c:any)=>!search || c.symbol.toLowerCase().includes(search.toLowerCase())).map((c:any)=> (
                        <div className="card-row" key={c.symbol}>
                            <div className="left">
                                <div className="sym"><i className={`cf cf-${c.symbol.toLowerCase()}`}></i> {c.symbol}</div>
                                <div className="sub">Qty (TX): {c.qtyTx} • Qty (API): {c.qtyApiAvail+c.qtyApiInOrder} • In Orders: {c.qtyApiInOrder}</div>
                            </div>
                            <div className="right">
                                <div className="cell">
                                    <div className="label">Total Buy-in</div>
                                    <div className="value">€{c.totalBuyIn?.toLocaleString?.() ?? c.totalBuyIn}</div>
                                    {/* <div className="label">Price</div> */}
                                    <div className="sub">Price: €{c.priceEUR.toLocaleString()}</div>
                                </div>
                                <div className="cell">
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
                                    <div className="value" style={{ color: c.unrealized >= 0 ? '#059669' : '#dc2626' }}>{c.unrealized >= 0 ? '+' : ''}€{(c.unrealized||0).toLocaleString()}</div>
                                </div>
                                <div className="cell" style={{ display: 'none' }}>
                                    <div className="label">Realized</div>
                                    <div className="value" style={{ color: c.realized >= 0 ? '#059669' : '#dc2626' }}>{c.realized >= 0 ? '+' : ''}€{(c.realized||0).toLocaleString()}</div>
                                </div>
                                <div className="cell" style={{ display: 'none' }}>
                                    <div className="label">Value (TX)</div>
                                    <div className="value">€{(c.valueTx||0).toLocaleString()}</div>
                                </div>
                                <div className="cell" >
                                    <div className="label">Value (API)</div>
                                    <div className="value">€{(c.valueApi||0).toLocaleString()}</div>
                                    <div className="sub">Avg Buy In: €{c.avgBuyIn.toLocaleString()}</div>

                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="card">
                <h3>Bitvavo Connection</h3>
                {
                    conn?.connected ? (<div className="row" style={{ justifyContent: "space-between" }}>
                        <div>
                            <div>Connected to Bitvavo{conn?.connection?.label ? ` (${conn.connection.label})` : ""}</div>
                        </div>
                        <div className="row">
                            <select value={timeframe} onChange={(e) => { const tf = e.target.value as '1D' | '1W' | '1M' | 'YTD' | '1Y' | 'Max'; setTimeframe(tf); }}>
                                <option value="1D">1D</option>
                                <option value="1W">1W</option>
                                <option value="1M">1M</option>
                                <option value="YTD">YTD</option>
                                <option value="1Y">1Y</option>
                                <option value="Max">Max</option>
                            </select>
                            {/* Sync buttons removed; use top Import + Sync */}
                        </div>
                    </div>) : (<form className="row" onSubmit={saveBitvavo}>
                        <input name="label" placeholder="Label (optional)" />
                        <input name="apiKey" placeholder="API Key" required />
                        <input name="apiSecret" placeholder="API Secret" required />
                        <button className="btn" type="submit">Connect</button>
                    </form>)
                }

                {vals?.valuations?.length ? (<div style={{ marginTop: 12 }}>
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>Total (EUR): €{vals.totals.valueTotalEUR.toLocaleString()}</div>
                        <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>In Orders: €{(vals.totals.valueInOrderEUR ?? 0).toLocaleString()}</div>
                    </div>
                    <table className="pretty" style={{ display: 'none' }}>
                        <thead>
                            <tr>
                                <th>Symbol</th>
                                <th>Available</th>
                                <th>In Order</th>
                                <th>Price (EUR)</th>
                                <th>24h Delta</th>
                                <th>24h</th>
                                <th>Value Avail (EUR)</th>
                                <th>Value Total (EUR)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vals.valuations.map((v) => (<tr key={v.symbol}>
                                <td>{v.symbol}</td>
                                <td>{v.available}</td>
                                <td>{v.inOrder}</td>
                                <td>€{v.priceEUR}</td>
                                <td style={{ color: v.change24h >= 0 ? '#059669' : '#dc2626' }}>{v.change24h >= 0 ? '+' : ''}{v.change24h}</td>

                                <td style={{ color: v.change24hPct >= 0 ? '#059669' : '#dc2626' }}>{v.change24hPct >= 0 ? '+' : ''}{v.change24hPct}%</td>
                                <td>€{(v.valueTotalEUR - v.valueInOrderEUR).toLocaleString()}</td>
                                <td>€{v.valueTotalEUR.toLocaleString()}</td>
                            </tr>))}
                        </tbody>
                    </table>
                    <div className="row" style={{ justifyContent: 'flex-end', margin: '8px 0' }}>
                        <input placeholder="Search coin (e.g. BTC)" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220 }} />
                    </div>
                    <div className="cards">
                        {vals.valuations.filter((v:any) => !search || v.symbol.toLowerCase().includes(search.toLowerCase())).map((v) => (
                            <div className="card-row" key={v.symbol}>
                                <div className="left">
                                    <div className="sym">{v.symbol} <span className="sub">x{v.available + v.inOrder}</span></div>
                                    <div className="sub">In Orders: {v.inOrder}</div>
                                </div>
                                <div className="right">
                                    <div className="cell">
                                        <div className="label">Price</div>
                                        <div className="value">€{v.priceEUR}</div>
                                    </div>
                                    <div className="cell" style={{ minWidth: 200 }}>
                                        <div className="label" style={{ paddingRight: 8 }}>24h</div>
                                        <div className="value">
                                            {/* <td style={{ color: v.change24h >= 0 ? '#059669' : '#dc2626' }}>{v.change24h >= 0 ? '+' : ''}{v.change24h}</td>

                                            <td style={{ color: v.change24hPct >= 0 ? '#059669' : '#dc2626' }}>{v.change24hPct >= 0 ? '+' : ''}{v.change24hPct}%</td> */}
                                            <span className="badge" style={{ color: v.change24h >= 0 ? '#059669' : '#dc2626' }}>{v.change24h >= 0 ? '+' : ''}{v.change24h}</span>
                                            <span className="badge" style={{ marginLeft: 8, color: v.change24hPct >= 0 ? '#059669' : '#dc2626' }}>{v.change24hPct >= 0 ? '+' : ''}{v.change24hPct}%</span>
                                        </div>
                                    </div>
                                    <div className="cell">
                                        <div className="sub">In Orders: €{v.valueInOrderEUR.toLocaleString()}</div>
                                        <div className="value" style={{ fontSize: 18, fontWeight: 700 }}>€{v.valueTotalEUR.toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {/* <div className="sub">In Orders: {vals.totals.valueInOrderEUR?.toLocaleString()}</div> */}
                </div>) : null}
                {!vals?.valuations?.length && bv?.balances?.length ?
                    (
                        <div style={{ marginTop: 12 }}>
                            <table className="pretty">
                                <thead>
                                    <tr>
                                        <th>Symbol</th>
                                        <th>Available</th>
                                        <th>In Order</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bv.balances.filter(b => (+b.available || +b.inOrder)).map((b) => (<tr key={b.symbol}>
                                        <td>{b.symbol}</td>
                                        <td>{b.available}</td>
                                        <td>{b.inOrder}</td>
                                    </tr>))}
                                </tbody>
                            </table>
                        </div>
                    ) : null
                }
            </div>
            <div className="card" style={{ display: 'none' }}>
                <h3>Holdings</h3>
                <div className="cards">
                    {portfolio.assets.map((a) => (<div className="card-row" key={a.symbol}>
                        <div className="left">
                            <div className="sym">{a.symbol}</div>
                            <div className="sub">Qty {a.quantityHeld}</div>
                        </div>
                        <div className="right">
                            <div className="cell">
                                <div className="label">Unrealized</div>
                                <div className="value" style={{ color: a.unrealizedPnL >= 0 ? '#059669' : '#dc2626' }}>
                                    {a.unrealizedPnL >= 0 ? '+' : ''}€{a.unrealizedPnL.toLocaleString()} ({a.unrealizedPnLPercent}%)
                                </div>
                            </div>
                            <div className="cell">
                                <div className="label">Realized</div>
                                <div className="value" style={{ color: a.realizedPnL >= 0 ? '#059669' : '#dc2626' }}>
                                    {a.realizedPnL >= 0 ? '+' : ''}€{a.realizedPnL.toLocaleString()}
                                </div>
                            </div>
                            <div className="cell">
                                <div className="label">Avg Buy In</div>
                                <div className="value">€{a.avgCostBasisPerUnit}</div>
                            </div>
                            <div className="cell">
                                <div className="label">Position</div>
                                <div className="value">€{a.marketValue.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>))}

                </div>
            </div>
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
                            .filter((t:any)=>!txSearch || (t.assetSymbol||'').toLowerCase().includes(txSearch.toLowerCase()))
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
                                                <input style={{ width: 90 }} type="text" value={(edit.assetSymbol ?? t.assetSymbol)} onChange={(e) => setEdit({ ...edit, assetSymbol: e.target.value })} />
                                                <input style={{ width: 90 }} type="number" step="0.00000001" value={(edit.quantity ?? t.quantity)} onChange={(e) => setEdit({ ...edit, quantity: Number(e.target.value) })} />
                                            </div>
                                        </td>
                                        <td>
                                            <div className="row">
                                                <input style={{ width: 90 }} type="text" value={(edit.quoteCurrency ?? t.quoteCurrency)} onChange={(e) => setEdit({ ...edit, quoteCurrency: e.target.value })} />
                                                <input style={{ width: 90 }} type="number" step="0.01" value={(edit.pricePerUnit ?? t.pricePerUnit)} onChange={(e) => setEdit({ ...edit, pricePerUnit: Number(e.target.value) })} />
                                            </div>
                                        </td>
                                        <td>{(edit.pricePerUnit ?? t.pricePerUnit)}</td>
                                        <td><input style={{ width: 90 }} type="number" step="0.01" value={(edit.fee ?? t.fee)} onChange={(e) => setEdit({ ...edit, fee: Number(e.target.value) })} /></td>
                                        <td><input type="text" value={(edit.note ?? t.note ?? '')} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></td>
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
        </div >);
}








