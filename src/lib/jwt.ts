import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const sm = new SecretsManagerClient({});
const ACCESS_TTL_SEC = parseInt(process.env.ACCESS_TTL_SEC || "900", 10); // 15 minutes
const REFRESH_TTL_SEC = parseInt(process.env.REFRESH_TTL_SEC || "604800", 10); // 7 days
const secretArn = process.env.JWT_SECRET_ARN!;

let cachedSecret: Uint8Array | null = null;
async function secret(): Promise<Uint8Array> {
  if (cachedSecret) return cachedSecret;
  const res = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const val = res.SecretString!;
  cachedSecret = new TextEncoder().encode(val);
  return cachedSecret;
}

export function nowIso() {
  return new Date().toISOString();
}

export async function signAccess(claims: { sub: string }) {
  return await new SignJWT({ ...claims, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(await secret());
}
export async function signRefresh(claims: { sub: string }) {
  return await new SignJWT({ ...claims, typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SEC}s`)
    .sign(await secret());
}
export async function verifyRefresh(
  token: string
): Promise<JWTPayload & { sub: string }> {
  const { payload } = await jwtVerify(token, await secret(), {
    algorithms: ["HS256"],
  });
  if (payload.typ !== "refresh") throw new Error("wrong token type");
  return payload as any;
}

export function isLocked(user: any) {
  if (!user?.lockUntil) return false;
  return new Date(user.lockUntil).getTime() > Date.now();
}
