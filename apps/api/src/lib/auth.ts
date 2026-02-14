import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export type AuthTokenPayload = {
  sub: string;
  email: string;
};

function readJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }

  return secret;
}

export function getTokenTtl() {
  return process.env.TOKEN_TTL?.trim() || "7d";
}

export function getBcryptRounds() {
  const value = Number(process.env.BCRYPT_ROUNDS ?? "12");
  if (!Number.isInteger(value) || value < 8 || value > 15) {
    return 12;
  }

  return value;
}

export async function hashPassword(password: string) {
  const rounds = getBcryptRounds();
  return bcrypt.hash(password, rounds);
}

export async function comparePassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function signAuthToken(payload: AuthTokenPayload) {
  return jwt.sign(payload, readJwtSecret(), {
    expiresIn: getTokenTtl() as jwt.SignOptions["expiresIn"]
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, readJwtSecret());
    if (!decoded || typeof decoded !== "object") {
      return null;
    }

    const sub = typeof decoded.sub === "string" ? decoded.sub : null;
    const email = typeof decoded.email === "string" ? decoded.email : null;

    if (!sub || !email) {
      return null;
    }

    return { sub, email };
  } catch {
    return null;
  }
}
