Crypto Portfolio Tracker (Next.js)

Overview
- Google sign-in via NextAuth
- Store transactions in SQLite via Prisma
- Compute average buy-in, realized and unrealized PnL (FIFO)
- Simple dashboard with holdings and summary

Google
{"web":{"client_id":"1028975072181-hlau8ncbimg61jflnriqlur1kc274e1f.apps.googleusercontent.com","project_id":"portfoliotracker-476122","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_secret":"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","javascript_origins":["http://localhost","https://arthurstruik.com","https://arthurstruik.nl","http://localhost:3000"]}}

client id: 1028975072181-hlau8ncbimg61jflnriqlur1kc274e1f.apps.googleusercontent.com
client secret: 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

Setup
1) Copy `.env.example` to `.env` and fill in values:
   - `NEXTAUTH_SECRET`: any random string in dev
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: create a Google OAuth Client (Web), set Authorized redirect URI to `http://localhost:3000/api/auth/callback/google`.
2) Install dependencies:
   - npm install
3) Generate Prisma client and create DB:
   - npx prisma generate
   - npx prisma migrate dev --name init
4) Run dev server:
   - npm run dev

Notes
- Price data currently uses an in-memory mock (`src/lib/prices.ts`). Replace with a real provider (e.g., CoinGecko) and cache results server-side.
- PnL uses FIFO lot matching. You can change to average-cost if preferred.
- Adjust the Prisma schema and UI to track per-exchange or per-wallet if needed.

Bitvavo integration
- Store API credentials securely per user: `ExchangeConnection` in Prisma.
- Encryption: set `ENCRYPTION_KEY` in `.env` to a 32-byte key (base64/hex/utf8). Example: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- API endpoints:
  - `GET /api/connections/bitvavo` → check connection
  - `POST /api/connections/bitvavo` → save `{ apiKey, apiSecret, label? }`
  - `GET /api/bitvavo/balances` → fetch live balances from Bitvavo
- Client code: `src/lib/bitvavo.ts` implements request signing (timestamp + method + path + body, HMAC-SHA256).
- UI: connect and sync from the Dashboard card in `src/pages/index.tsx`.

Key Files
- `prisma/schema.prisma`: DB models for users, sessions, transactions
- `src/pages/api/auth/[...nextauth].ts`: NextAuth routes
- `src/pages/api/transactions.ts`: GET/POST transactions
- `src/lib/pnl.ts`: FIFO lot + PnL calculations
- `src/lib/prices.ts`: price service abstraction and mock
- `src/pages/index.tsx`: Dashboard UI
