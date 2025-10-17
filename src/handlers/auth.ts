import type {
  APIGatewayProxyHandlerV2,
  APIGatewayProxyEventV2,
} from "aws-lambda";
import { getUser, putUser, updateLoginMeta, incFailed } from "../lib/db.js";
import { hashPassword, verifyPassword } from "../lib/crypto.js";
import { signAccess, signRefresh, nowIso, isLocked } from "../lib/jwt.js";
import {
  parseRegister,
  parseLogin,
  ValidationError,
} from "../lib/validation.js";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambda = new LambdaClient({});

// error categories
class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

//api agetway handler
export const handler: APIGatewayProxyHandlerV2 = async (
  event: APIGatewayProxyEventV2
) => {
  const requestId = event.requestContext.requestId;

  try {
    const path = event.rawPath || "";

    // Method validation
    if (event.requestContext.http.method !== "POST") {
      console.warn(
        JSON.stringify({
          requestId,
          event: "invalid_method",
          method: event.requestContext.http.method,
          path,
        })
      );
      return resp(405, {
        success: false,
        message: "Method Not Allowed",
        payload: null,
      });
    }

    // Body validation
    let body: any;
    try {
      body = JSON.parse(event.body ?? "{}");
    } catch (e) {
      console.warn(
        JSON.stringify({
          requestId,
          event: "invalid_json",
          path,
        })
      );
      return resp(400, {
        success: false,
        message: "Invalid JSON",
        payload: null,
      });
    }

    //  route entry point
    switch (path) {
      case "/register":
        return await register(body, requestId);
      case "/login":
        return await login(body, requestId);
      case "/token/refresh":
        return await refresh(body, requestId);
      default:
        console.warn(
          JSON.stringify({
            requestId,
            event: "route_not_found",
            path,
          })
        );
        return resp(404, {
          success: false,
          message: "Not Found",
          payload: null,
        });
    }
  } catch (e) {
    const error = e as Error;
    console.error(
      JSON.stringify({
        requestId,
        level: "error",
        msg: "unhandled_exception",
        err: error.message,
        stack: error.stack,
        errorType: error.name,
      })
    );

    // Categorized error responses
    if (error instanceof ValidationError) {
      return resp(400, {
        success: false,
        message: "Validation failed",
        payload: {
          issues: error.issues,
        },
      });
    }
    if (error instanceof AuthenticationError) {
      return resp(401, {
        success: false,
        message: "Authentication failed",
        payload: null,
      });
    }
    if (error instanceof RateLimitError) {
      return resp(429, {
        success: false,
        message: "Too many requests",
        payload: null,
      });
    }

    return resp(500, {
      success: false,
      message: "Internal server error",
      payload: null,
    });
  }
};

async function register(body: any, requestId: string) {
  try {
    const data = parseRegister(body);
    const exists = await getUser(data.email);
    if (exists) {
      console.warn(
        JSON.stringify({
          requestId,
          event: "registration_conflict",
          email: data.email,
        })
      );
      return resp(409, {
        success: false,
        message: "User exists",
        payload: null,
      });
    }

    try {
      const invokeRes = await lambda.send(
        new InvokeCommand({
          FunctionName: process.env.PASSWORD_CHECK_LAMBDA_ARN!,
          Payload: Buffer.from(
            JSON.stringify({
              body: JSON.stringify({ password: data.password }),
            })
          ),
        })
      );

      const payload = JSON.parse(
        Buffer.from(invokeRes.Payload || []).toString()
      );
      const parsed = payload.body ? JSON.parse(payload.body) : payload;

      if (!parsed.ok) {
        // code conversion
        const reasonMessages: Record<string, string> = {
          too_short: "Password must be at least 8 characters long",
          no_uppercase: "Password must contain at least one uppercase letter",
          no_lowercase: "Password must contain at least one lowercase letter",
          no_number: "Password must contain at least one number",
          no_symbol: "Password must contain at least one special character",
          pwned_password:
            "This password has been found in data breaches and is not secure",
        };

        const userFriendlyReasons = parsed.reasons.map(
          (code: string) => reasonMessages[code] || code
        );

        console.warn(
          JSON.stringify({
            requestId,
            event: "password_weak",
            email: data.email,
            reasons: parsed.reasons,
          })
        );
        return resp(400, {
          success: false,
          message: "Password does not meet security requirements",
          payload: { reasons: userFriendlyReasons },
        });
      }
    } catch (err: any) {
      console.error(
        JSON.stringify({
          requestId,
          level: "error",
          msg: "password_check_failed",
          err: err.message,
        })
      );
      return resp(500, {
        success: false,
        message: "Password validation failed",
      });
    }

    // create account
    const password_hash = await hashPassword(data.password);
    await putUser({ email: data.email, name: data.name, password_hash });

    console.log(
      JSON.stringify({
        requestId,
        event: "user_registered",
        email: data.email,
      })
    );
    return resp(201, {
      success: true,
      message: "Registered",
      payload: null,
    });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      return resp(400, {
        success: false,
        message: "Validation failed",
        payload: {
          issues: err.issues,
        },
      });
    }
    throw new Error("Registration processing failed");
  }
}

async function login(body: any, requestId: string) {
  try {
    const data = parseLogin(body);
    const user = await getUser(data.email);
    if (!user) {
      console.warn(
        JSON.stringify({
          requestId,
          event: "login_failed",
          email: data.email,
          reason: "not_found",
        })
      );
      return resp(401, {
        success: false,
        message: "Invalid credentials",
        payload: null,
      });
    }

    if (isLocked(user)) {
      console.warn(
        JSON.stringify({
          requestId,
          event: "login_locked",
          email: data.email,
        })
      );
      throw new RateLimitError("Account temporarily locked");
    }

    const ok = await verifyPassword(data.password, user.password_hash);
    if (!ok) {
      await incFailed(user.email, user.failedLoginCount ?? 0);
      console.warn(
        JSON.stringify({
          requestId,
          event: "login_failed",
          email: data.email,
          reason: "bad_password",
        })
      );
      return resp(401, {
        success: false,
        message: "Invalid credentials",
        payload: null,
      });
    }

    const accessToken = await signAccess({ sub: user.email });
    const refreshToken = await signRefresh({ sub: user.email });

    await updateLoginMeta(user.email, {
      lastLoginAt: nowIso(),
      failedLoginCount: 0,
      lockUntil: null,
    });

    console.log(
      JSON.stringify({
        requestId,
        event: "login_success",
        email: user.email,
      })
    );
    return resp(200, {
      success: true,
      message: "Login successful",
      payload: {
        accessToken,
        refreshToken,
      },
    });
  } catch (err: any) {
    if (err instanceof RateLimitError) {
      throw err;
    }
    if (err instanceof ValidationError) {
      return resp(400, {
        success: false,
        message: "Validation failed",
        payload: {
          issues: err.issues,
        },
      });
    }
    console.error(
      JSON.stringify({
        requestId,
        level: "error",
        msg: "login_processing_error",
        err: err.message,
        stack: err.stack,
        errorType: err.name,
      })
    );

    throw new Error("Login processing failed");
  }
}

async function refresh(body: any, requestId: string) {
  try {
    const { refreshToken } = body || {};
    if (!refreshToken) {
      throw new ValidationError(["refreshToken is required"]);
    }

    const payload = await import("../lib/jwt.js").then((m) =>
      m.verifyRefresh(refreshToken)
    );
    const newAccess = await signAccess({ sub: payload.sub });
    const newRefresh = await signRefresh({ sub: payload.sub });

    console.log(
      JSON.stringify({
        requestId,
        event: "token_refreshed",
        sub: payload.sub,
      })
    );
    return resp(200, {
      success: true,
      message: "Token refreshed",
      payload: {
        accessToken: newAccess,
        refreshToken: newRefresh,
      },
    });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      throw err;
    }
    console.error(
      JSON.stringify({
        requestId,
        level: "error",
        msg: "refresh_failed",
        err: err.message,
      })
    );
    throw new AuthenticationError("Invalid or expired refresh token");
  }
}

const resp = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
