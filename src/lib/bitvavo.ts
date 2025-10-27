import crypto from "crypto";

const BASE_URL = "https://api.bitvavo.com";

function buildSignature({
  timestamp,
  method,
  path,
  body,
  secret,
}: {
  timestamp: string;
  method: string;
  path: string;
  body: string;
  secret: string;
}) {
  const token = `${timestamp}${method}${path}${body}`;
  return crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(token, "utf8")
    .digest("hex");
}

export async function bitvavoRequest<T>(
  apiKey: string,
  apiSecret: string,
  method: "GET" | "POST" | "DELETE" | "PUT",
  path: string,
  bodyObj?: any,
  windowMs = 60000
): Promise<T> {
  const timestamp = Date.now().toString();
  const body = bodyObj ? JSON.stringify(bodyObj) : "";

  const signature = buildSignature({
    timestamp,
    method,
    path,
    body,
    secret: apiSecret,
  });

  const url = `${BASE_URL}${path}`;
  console.log("Bitvavo request:", { url, path, body });
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Bitvavo-Access-Key": apiKey,
      "Bitvavo-Access-Timestamp": timestamp,
      "Bitvavo-Access-Signature": signature,
      "Bitvavo-Access-Window": String(windowMs),
    },
    body: body || undefined,
    cache: "no-store",
  });

  const text = await res.text();
  // console.log("Bitvavo response:", { status: res.status, text });
  if (!res.ok) {
    throw new Error(`Bitvavo API ${res.status}: ${text}`);
  }

  return JSON.parse(text) as T;
}

export type BitvavoBalance = {
  symbol: string;
  available: string;
  inOrder: string;
};
