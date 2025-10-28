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
        /* ===== Global Layout ===== */
        body {
          font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
          margin: 0;
          background: #f9fafb;
          color: #111827;
        }
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 32px 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .container .row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        /* ===== Cards ===== */
        .card {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 20px;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04);
          transition: box-shadow 0.2s ease, transform 0.2s ease;
        }
        .card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.06);
        }
        .card .row {
          display: flex;
          align-items: start;
          gap: 12px;
        }

        /* ===== Buttons ===== */
        .btn {
          display: inline-block;
          padding: 8px 14px;
          border-radius: 8px;
          font-weight: 500;
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          border: none;
          color: white;
          cursor: pointer;
          transition: background 0.2s ease, transform 0.1s ease;
        }
        .btn:hover {
          background: linear-gradient(135deg, #1e40af, #1d4ed8);
          transform: scale(1.02);
        }
        .btn.secondary {
          background: #f3f4f6;
          color: #111827;
          border: 1px solid #d1d5db;
        }
        .btn.secondary:hover {
          background: #e5e7eb;
        }

        /* ===== Inputs & Form ===== */
        input, select {
          padding: 8px 10px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          background: #fff;
          transition: border 0.2s ease;
        }
        input:focus, select:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37,99,235,0.1);
        }
        form.column {
          display: flex;
          flex-direction: row;
          gap: 12px;
        }
        .row {
          display: flex;
          align-items: start;
          gap: 12px;
        }

        /* ===== Tables ===== */
        table.pretty {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          border-radius: 12px;
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        table.pretty thead th {
          background: #f3f4f6;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 600;
          color: #4b5563;
        }
        table.pretty th, table.pretty td {
          padding: 14px 12px;
          text-align: right;
          border-bottom: 1px solid #e5e7eb;
        }
        table.pretty th:first-child, table.pretty td:first-child {
          text-align: left;
        }
        table.pretty tbody tr:hover {
          background: #f9fafb;
        }

        /* ===== Card Rows (Portfolio Items) ===== */
        .cards {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .card-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 18px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
          transition: background 0.2s ease, box-shadow 0.2s ease;
        }
        .card-row:hover {
          background: #f8fafc;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .card-row .left {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 180px;
        }
        .card-row .sym {
          font-weight: 600;
          font-size: 16px;
        }
        .card-row .sub {
          color: #6b7280;
          font-size: 13px;
        }
        .card-row .right {
          display: flex;
          align-items: baseline;
          gap: 24px;
          flex-wrap: wrap;
        }
        .card-row .cell {
          min-width: 120px;
          text-align: right;
        }
        .card-row .label {
          font-size: 12px;
          color: #9ca3af;
        }
        .card-row .value {
          font-size: 16px;
          font-weight: 600;
          color: #111827;
        }

        /* ===== Badges ===== */
        .badge {
          font-size: 14px;
          border-radius: 9999px;
          padding: 4px 10px;
          font-weight: 600;
        }
        .badge.pos {
          background: #ecfdf5;
          color: #047857;
        }
        .badge.neg {
          background: #fef2f2;
          color: #b91c1c;
        }

        /* ===== Icons ===== */
        .coin-icon {
          font-size: 20px;
          margin-right: 6px;
          vertical-align: middle;
        }

        @media (max-width: 640px) {
          .card-row .cell { min-width: auto; }
          .container { padding: 16px; }
        }

      `}</style>
      {/* <style>  
       `
        body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 0; }
        .container { max-width: 1400px; margin: 0 auto; padding: 24px;  }
        .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: right; padding: 8px; border-bottom: 1px solid #eee; }
        th:first-child, td:first-child { text-align: left; }
        .btn { display: inline-block; padding: 8px 12px; border: 1px solid #111; border-radius: 6px; background: #111; color: #fff; cursor: pointer; }
        .btn.secondary { background: #fff; color: #111; }
        .row { display: flex; gap: 12px; align-items: center; }
        input, select { padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; }

         Connect Bitvavo API modal 
        form.column { display: flex; flex-direction: row; gap: 12px; }

         Prettier table styling with taller rows
        table.pretty { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; border-collapse: separate; border-spacing: 0; }
        table.pretty th, table.pretty td { padding: 14px 12px; border-bottom: 1px solid #eee; }
        table.pretty thead th { background: #f9fafb; font-size: 13px; letter-spacing: .02em; text-transform: none; }
        table.pretty tbody tr { transition: background 120ms ease-in-out; }
        table.pretty tbody tr:nth-child(even) { background: #fafafa; }
        table.pretty tbody tr:hover { background: #f3f4f6; }
        table.pretty tbody tr:last-child td { border-bottom: none; }

        Card list rows 
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
      `}</style> */}
    </SessionProvider>
  );
}
