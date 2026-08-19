// PBKDF2-SHA256 via Web Crypto - works natively on Workers, no native
// bindings needed (unlike bcrypt/argon2).

const ITERATIONS = 210_000;
const KEY_LENGTH_BITS = 256;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function deriveBits(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH_BITS
  );
}

/** Returns "pbkdf2$<iterations>$<saltHex>$<hashHex>" */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt);
  return `pbkdf2$${ITERATIONS}$${toHex(salt.buffer as ArrayBuffer)}$${toHex(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const salt = fromHex(parts[2]);
  const expectedHex = parts[3];
  const bits = await deriveBits(password, salt);
  const actualHex = toHex(bits);
  if (actualHex.length !== expectedHex.length) return false;
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) {
    diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}
