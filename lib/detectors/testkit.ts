// Test helpers. Fake secrets are built at runtime so no real-looking key is committed.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Deterministic pseudo-random token with mixed case and digits. */
export function token(length: number, seed = 1): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[(seed * 31 + i * 7 + ((i * i) % 13)) % ALPHABET.length];
  }
  return out;
}

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

/** Builds a fake JWT with the given payload. */
export function jwt(payload: Record<string, unknown>, seed = 3): string {
  return `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}.${token(43, seed)}`;
}
