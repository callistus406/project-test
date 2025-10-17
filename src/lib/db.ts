import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME!;

export async function getUser(email: string) {
  const pk = `USER#${email}`;
  const resp = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { pk, sk: "PROFILE" } })
  );
  return resp.Item || null;
}

export async function putUser(input: {
  email: string;
  name: string;
  password_hash: string;
}) {
  const now = new Date().toISOString();
  const pk = `USER#${input.email}`;
  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk,
        sk: "PROFILE",
        email: input.email,
        name: input.name,
        password_hash: input.password_hash,
        createdAt: now,
        updatedAt: now,
        failedLoginCount: 0,
      },
      ConditionExpression: "attribute_not_exists(pk)",
    })
  );
}

export async function updateLoginMeta(
  email: string,
  fields: {
    lastLoginAt?: string;
    failedLoginCount?: number;
    lockUntil?: string | null;
  }
) {
  const pk = `USER#${email}`;
  let UpdateExpression = "SET updatedAt = :u";
  const ExpressionAttributeValues: any = { ":u": new Date().toISOString() };
  const ExpressionAttributeNames: any = {};

  if (fields.lastLoginAt) {
    UpdateExpression += ", lastLoginAt = :l";
    ExpressionAttributeValues[":l"] = fields.lastLoginAt;
  }
  if (fields.failedLoginCount !== undefined) {
    UpdateExpression += ", failedLoginCount = :f";
    ExpressionAttributeValues[":f"] = fields.failedLoginCount;
  }
  if (fields.lockUntil !== undefined) {
    UpdateExpression += ", lockUntil = :k";
    ExpressionAttributeValues[":k"] = fields.lockUntil;
  }

  const updateParams: any = {
    TableName: TABLE_NAME,
    Key: { pk, sk: "PROFILE" },
    UpdateExpression,
    ExpressionAttributeValues,
  };

  if (Object.keys(ExpressionAttributeNames).length > 0) {
    updateParams.ExpressionAttributeNames = ExpressionAttributeNames;
  }

  await client.send(new UpdateCommand(updateParams));
}

// simple expo  backoff with cap
export async function incFailed(email: string, current: number) {
  const next = (current || 0) + 1;
  const minutes = Math.min(1 << Math.min(next, 6), 60);
  const lockUntil =
    next >= 5 ? new Date(Date.now() + minutes * 60_000).toISOString() : null;

  const pk = `USER#${email}`;
  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk: "PROFILE" },
      UpdateExpression:
        "SET failedLoginCount = :f, updatedAt = :u, lockUntil = :k",
      ExpressionAttributeValues: {
        ":f": next,
        ":u": new Date().toISOString(),
        ":k": lockUntil,
      },
    })
  );
}
