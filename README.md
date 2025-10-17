# Auth System

## Setup and Deployment

### 1. Install Dependencies

```bash
npm install
cd cdk && npm install && cd ..
```

### 2. Build the Application

```bash
npm run build
```

### 3. Bootstrap CDK (execute once)

```bash
npm run cdk:bootstrap
```

### 4. Deploy to AWS

```bash
npm run cdk:deploy
```

## API Endpoints

### POST /register

Register a new user account.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}
```

**Response (201):**

```json
{
  "success": true,
  "message": "Registered",
  "payload": null
}
```

### POST /login

Authenticate and receive tokens.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Login successful",
  "payload": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

### POST /token/refresh

Refresh access and refresh tokens.

**Request:**

```json
{
  "refreshToken": "eyJ..."
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Token refreshed",
  "payload": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

## Token Model and Security

### Custom JWT Implementation

This system uses **custom JWT tokens** signed with AWS Secrets Manager secrets:

- **Algorithm**: HS256 (HMAC-SHA256)
- **Secret Storage**: AWS Secrets Manager (rotatable)
- **Token Types**: `access` and `refresh` tokens with different lifetimes

### Token Lifetimes

- **Access Tokens**: 15 minutes (900 seconds)

- **Refresh Tokens**: 7 days (604800 seconds)

## Testing with curl

Base Url: https://14b6d3krvk.execute-api.eu-west-1.amazonaws.com

```bash
# Register a user
curl -X POST https://14b6d3krvk.execute-api.eu-west-1.amazonaws.com/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}'

# Login
curl -X POST https://14b6d3krvk.execute-api.eu-west-1.amazonaws.com/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# Refresh token (use refreshToken from login response)
curl -X POST https://14b6d3krvk.execute-api.eu-west-1.amazonaws.com/token/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN_HERE"}'
```

## Monitoring and Observability

### Structured Logging

All events are logged as structured JSON to CloudWatch with request IDs for request tracing:

```json
{
  "requestId": "SjkyCioYDoEEMvA=",
  "event": "login_success",
  "email": "user@example.com"
}
```

### Key Events Tracked

- `user_registered` - New user creation
- `login_success` - Successful authentication
- `login_failed` - Failed login attempts (with reasons)
- `login_locked` - Account lockout triggered
- `token_refreshed` - Token refresh operations
- `password_weak` - Password validation failures

### Metrics Production

Metrics are available in CloudWatch:

**Lambda Metrics** (automatically generated):

- `Duration` - Function execution time
- `Errors` - Function errors and failures
- `Invocations` - Total function calls
- `Throttles` - Rate limiting events

**Custom Metrics** (log-based):

- Login success/failure rates
- Registration rates
- Token refresh frequency
- Account lockout events
- Password validation failures

**DynamoDB Metrics** (automatically generated):

- `ConsumedReadCapacityUnits`
- `ConsumedWriteCapacityUnits`
- `ThrottledRequests`
- `UserErrors`

## Python Mini-Tasks

### 1. Password Strength Validator

```bash
cd src/python
python password_check_lambda.py
```

### 2. Log Summarizer

```bash
cd src/python
python log_summarizer.py sample_logs.jsonl
```

## Cleanup

To remove all AWS resources:

```bash
npm run destroy
```

## Development

Run tests:

```bash
npm test
```

Build for deployment:

```bash
npm run build
```

### Logs

View Lambda logs in CloudWatch:

```bash
# Find the correct log group name first
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/AuthStack" --query 'logGroups[].logGroupName' --output table

# Then use the full name (example from your deployment)
aws logs tail "/aws/lambda/AuthStack-AuthFnE7829713-r7aQQFeX05GU" --follow

# Or get recent logs without following
aws logs tail "/aws/lambda/AuthStack-AuthFnE7829713-r7aQQFeX05GU" --since 10m
```
