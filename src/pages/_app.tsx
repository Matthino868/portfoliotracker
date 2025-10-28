import { SessionProvider } from "next-auth/react";
import Head from "next/head";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SessionProvider session={(pageProps as any).session}>
      <Head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/monzanifabio/cryptofont/cryptofont.css"
        />
      </Head>
      <Component {...pageProps} />
      <style jsx global>{`
        body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 0; }
        .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
        .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: right; padding: 8px; border-bottom: 1px solid #eee; }
        th:first-child, td:first-child { text-align: left; }
        .btn { display: inline-block; padding: 8px 12px; border: 1px solid #111; border-radius: 6px; background: #111; color: #fff; cursor: pointer; }
        .btn.secondary { background: #fff; color: #111; }
        .row { display: flex; gap: 12px; align-items: center; }
        input, select { padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; }

        /* Prettier table styling with taller rows */
        table.pretty { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; border-collapse: separate; border-spacing: 0; }
        table.pretty th, table.pretty td { padding: 14px 12px; border-bottom: 1px solid #eee; }
        table.pretty thead th { background: #f9fafb; font-size: 13px; letter-spacing: .02em; text-transform: none; }
        table.pretty tbody tr { transition: background 120ms ease-in-out; }
        table.pretty tbody tr:nth-child(even) { background: #fafafa; }
        table.pretty tbody tr:hover { background: #f3f4f6; }
        table.pretty tbody tr:last-child td { border-bottom: none; }

        /* Card list rows */
        .cards { display: flex; flex-direction: column; gap: 12px; }
        .card-row { display: flex; align-items: center; justify-content: space-between; padding: 18px 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; }
        .card-row .left { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 200px; }
        .card-row .sym { font-weight: 600; font-size: 16px; }
        .card-row .sub { color: #6b7280; font-size: 12px; }
        .card-row .right { display: flex; align-items: baseline; gap: 24px; flex-wrap: wrap;  }
        .card-row .cell { min-width: 120px; text-align: right; }
        .card-row .label { font-size: 12px; color: #6b7280; }
        .card-row .value { font-size: 16px; font-weight: 600; }
        .badge { font-size: 16px; border-radius: 9999px; padding: 4px 8px; }
        .badge.pos { background: #ecfdf5; color: #065f46; }
        .badge.neg { background: #fef2f2; color: #991b1b; }
        @media (max-width: 640px) { .card-row .cell { min-width: auto; } }
        .coin-icon { font-size: 18px; margin-right: 8px; vertical-align: middle; }
      `}</style>
    </SessionProvider>
  );
}
