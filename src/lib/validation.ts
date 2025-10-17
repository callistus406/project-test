import { z } from "zod";

const registerSchema = z.object({
  email: z
    .string()
    .email("Please provide a valid email address")
    .max(254, "Email address is too long "),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(128, "Password is too long"),
  name: z.string().min(1, "Name is required").max(100, "Name is too long "),
});

const loginSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
});

export class ValidationError extends Error {
  constructor(public issues: string[]) {
    super(`Validation failed: ${issues.join(", ")}`);
    this.name = "ValidationError";
  }
}

export function parseRegister(body: unknown) {
  const res = registerSchema.safeParse(body);
  if (!res.success) {
    const issues = res.error.issues.map((err) => err.message);
    throw new ValidationError(issues);
  }
  return res.data;
}

export function parseLogin(body: unknown) {
  const res = loginSchema.safeParse(body);
  if (!res.success) {
    const issues = res.error.issues.map((err) => err.message);
    throw new ValidationError(issues);
  }
  return res.data;
}
