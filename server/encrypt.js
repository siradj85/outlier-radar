import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey() {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) throw new Error("Missing ENCRYPTION_SECRET");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  let enc = cipher.update(text, "utf8", "hex");
  enc += cipher.final("hex");
  return { encrypted: enc, iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex") };
}

export function decrypt(encrypted, ivHex, tagHex) {
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let dec = decipher.update(encrypted, "hex", "utf8");
  dec += decipher.final("utf8");
  return dec;
}
