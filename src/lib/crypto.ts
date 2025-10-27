import crypto from "crypto";

const KEY_ENV = process.env.ENCRYPTION_KEY || ""; // base64 or hex or raw

function getKey(): Buffer | null {
  if (!KEY_ENV) return null;
  try {
    // try base64 first, then hex, else raw utf8
    if (/^[A-Za-z0-9+/=]+$/.test(KEY_ENV) && KEY_ENV.length % 4 === 0) {
      const b64 = Buffer.from(KEY_ENV, "base64");
      if (b64.length === 32) return b64;
    }
    if (/^[0-9a-fA-F]+$/.test(KEY_ENV)) {
      const hex = Buffer.from(KEY_ENV, "hex");
      if (hex.length === 32) return hex;
    }
    const utf = Buffer.from(KEY_ENV, "utf8");
    if (utf.length === 32) return utf;
  } catch {}
  return null;
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  if (!key) return `plain:${plain}`; // fallback if key missing
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), enc.toString("base64"), tag.toString("base64")].join(":");
}

export function decryptSecret(enc: string): string {
  if (enc.startsWith("plain:")) return enc.slice(6);
  const key = getKey();
  if (!key) throw new Error("ENCRYPTION_KEY not set for decryption");
  const [ivB64, ctB64, tagB64] = enc.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}

