import bcrypt from "bcryptjs";
const ROUNDS = 10;
export async function hashPassword(password: string) {
  return await bcrypt.hash(password, ROUNDS);
}
export async function verifyPassword(password: string, hash: string) {
  return await bcrypt.compare(password, hash);
}
