import { jest } from "@jest/globals";

jest.unstable_mockModule("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn(),
}));

jest.unstable_mockModule("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(),
  },
  GetCommand: jest.fn(),
  PutCommand: jest.fn(),
  UpdateCommand: jest.fn(),
}));

jest.unstable_mockModule("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: jest.fn(),
  GetSecretValueCommand: jest.fn(),
}));

jest.unstable_mockModule("@aws-sdk/client-lambda", () => ({
  LambdaClient: jest.fn(),
  InvokeCommand: jest.fn(),
}));

process.env.TABLE_NAME = "test-table";
process.env.JWT_SECRET_ARN =
  "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret";
process.env.ACCESS_TTL_SEC = "900";
process.env.REFRESH_TTL_SEC = "604800";
process.env.PASSWORD_CHECK_LAMBDA_ARN =
  "arn:aws:lambda:us-east-1:123456789012:function:password-check";
