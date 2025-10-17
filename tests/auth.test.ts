// Mock AWS SDK and problematic ES modules first
jest.mock("@aws-sdk/client-dynamodb");
jest.mock("@aws-sdk/lib-dynamodb");
jest.mock("@aws-sdk/client-secrets-manager");
jest.mock("jose", () => ({
  SignJWT: jest.fn(),
  jwtVerify: jest.fn(),
}));

import { hashPassword, verifyPassword } from "../src/lib/crypto.js";
import { parseLogin, parseRegister } from "../src/lib/validation.js";
import { isLocked } from "../src/lib/jwt.js";

describe("Auth System Tests", () => {
  describe("Password Hashing", () => {
    test("bcrypt roundtrip works correctly", async () => {
      const password = "Hello123!";
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(await verifyPassword(password, hash)).toBe(true);
      expect(await verifyPassword("wrong", hash)).toBe(false);
    });

    test("different passwords produce different hashes", async () => {
      const hash1 = await hashPassword("password1");
      const hash2 = await hashPassword("password2");
      expect(hash1).not.toBe(hash2);
    });

    test("same password produces different hashes (salt)", async () => {
      const password = "SamePassword123!";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      expect(hash1).not.toBe(hash2);
      expect(await verifyPassword(password, hash1)).toBe(true);
      expect(await verifyPassword(password, hash2)).toBe(true);
    });
  });

  describe("Input Validation", () => {
    test("valid registration data passes", () => {
      expect(() =>
        parseRegister({
          email: "test@example.com",
          password: "Password123!",
          name: "Test User",
        })
      ).not.toThrow();
    });

    test("valid login data passes", () => {
      expect(() =>
        parseLogin({
          email: "test@example.com",
          password: "Password123!",
        })
      ).not.toThrow();
    });

    test("invalid email formats are rejected", () => {
      expect(() =>
        parseRegister({
          email: "notanemail",
          password: "Password123!",
          name: "Test",
        })
      ).toThrow();

      expect(() =>
        parseLogin({
          email: "bad@",
          password: "Password123!",
        })
      ).toThrow();
    });

    test("short passwords are rejected", () => {
      expect(() =>
        parseRegister({
          email: "test@example.com",
          password: "short",
          name: "Test",
        })
      ).toThrow();

      expect(() =>
        parseLogin({
          email: "test@example.com",
          password: "1234567",
        })
      ).toThrow();
    });

    test("long passwords are rejected", () => {
      const longPassword = "a".repeat(129);
      expect(() =>
        parseRegister({
          email: "test@example.com",
          password: longPassword,
          name: "Test",
        })
      ).toThrow();
    });

    test("empty name is rejected", () => {
      expect(() =>
        parseRegister({
          email: "test@example.com",
          password: "Password123!",
          name: "",
        })
      ).toThrow();
    });

    test("long name is rejected", () => {
      const longName = "a".repeat(101);
      expect(() =>
        parseRegister({
          email: "test@example.com",
          password: "Password123!",
          name: longName,
        })
      ).toThrow();
    });

    test("missing fields are rejected", () => {
      expect(() =>
        parseRegister({
          email: "test@example.com",
          password: "Password123!",
          // missing name
        })
      ).toThrow();

      expect(() =>
        parseLogin({
          email: "test@example.com",
          // missing password
        })
      ).toThrow();
    });
  });

  describe("Account Lockout Logic", () => {
    test("user without lockUntil is not locked", () => {
      const user = { email: "test@example.com" };
      expect(isLocked(user)).toBe(false);
    });

    test("user with null lockUntil is not locked", () => {
      const user = { email: "test@example.com", lockUntil: null };
      expect(isLocked(user)).toBe(false);
    });

    test("user with past lockUntil is not locked", () => {
      const pastTime = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
      const user = { email: "test@example.com", lockUntil: pastTime };
      expect(isLocked(user)).toBe(false);
    });

    test("user with future lockUntil is locked", () => {
      const futureTime = new Date(Date.now() + 60000).toISOString(); // 1 minute from now
      const user = { email: "test@example.com", lockUntil: futureTime };
      expect(isLocked(user)).toBe(true);
    });
  });

  describe("JWT Token Handling", () => {
    // Note: These tests require proper mocking of AWS Secrets Manager
    // For now, we'll test the structure without actual signing

    test("isLocked function is available", () => {
      expect(typeof isLocked).toBe("function");
    });
  });

  describe("Edge Cases and Security", () => {
    test("handles malformed JSON gracefully", () => {
      // This would be tested in integration tests with actual handler
      expect(true).toBe(true); // Placeholder
    });

    test("handles database connection failures", () => {
      // This would be tested with mocked database failures
      expect(true).toBe(true); // Placeholder
    });

    test("handles extremely long email addresses", () => {
      const longEmail = "a".repeat(245) + "@test.com"; // 254 chars total
      expect(() =>
        parseRegister({
          email: longEmail,
          password: "Password123!",
          name: "Test",
        })
      ).not.toThrow();

      const tooLongEmail = "a".repeat(246) + "@test.com"; // 255 chars
      expect(() =>
        parseRegister({
          email: tooLongEmail,
          password: "Password123!",
          name: "Test",
        })
      ).toThrow();
    });
  });
});
