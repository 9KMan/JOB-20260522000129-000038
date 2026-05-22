# Serverless Backend Platform

Production-grade serverless backend using AWS Lambda + API Gateway + DynamoDB + Cognito. Scales to zero, ~$8/month at low traffic.

## Architecture

```
                         ┌─────────────────────────────────────────┐
                         │            API Gateway (HTTP API)        │
                         │   JWT Authorizer  │  Rate Limit 100/s   │
                         └────────────────────┴────────────────────┘
                                              │
          ┌───────────────────────────────────┼───────────────────────────────────┐
          │                                   │                                   │
          ▼                                   ▼                                   ▼
  ┌───────────────┐                   ┌───────────────┐                   ┌───────────────┐
  │  Auth Lambda  │                   │  Users Lambda │                   │  Data Lambda  │
  │  (Cognito)    │                   │  (CRUD)       │                   │  (CRUD)       │
  └───────┬───────┘                   └───────┬───────┘                   └───────┬───────┘
          │                                   │                                   │
          └───────────────────────────────────┼───────────────────────────────────┘
                                              │
                          ┌───────────────────┼───────────────────┐
                          ▼                   ▼                   ▼
                   ┌────────────┐     ┌────────────┐      ┌────────────┐
                   │  Cognito   │     │  DynamoDB  │      │     S3     │
                   │  User Pool │     │  (Users +  │      │ (presigned │
                   │  (JWT)     │     │   Data)    │      │   URLs)    │
                   └────────────┘     └────────────┘      └────────────┘
```

## Data Model

### DynamoDB Single-Table Design

| Entity | PK | SK | Notes |
|--------|----|----|-------|
| User | `USER#<id>` | — | GSI: email → user_id |
| User Profile | `USER#<id>` | `PROFILE` | name, email, created_at |
| Data Item | `DATA#<id>` | `CREATED#<ts>` | GSI: user_id → created_at |

**GSI1 (email-index):** `email → PK` — for user lookup by email
**GSI2 (user-index):** `user_id → created_at` — for listing user's data items

## CLI Reference

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run unit tests
npm test

# Lint
npm run lint

# Deploy to AWS (dev)
cdk deploy --context env=dev

# Synthesize CloudFormation
cdk synth

# Destroy stack
cdk destroy --context env=dev
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | None | Register new user (email, password) |
| POST | `/auth/signin` | None | Login, returns JWT access + refresh tokens |
| POST | `/auth/refresh` | None | Refresh access token |
| GET | `/users/me` | JWT | Get current user profile |
| PUT | `/users/me` | JWT | Update current user profile |
| GET | `/data` | JWT | List data items (paginated, 20/page) |
| POST | `/data` | JWT | Create new data item |
| GET | `/data/{id}` | JWT | Get specific data item |
| PUT | `/data/{id}` | JWT | Update data item (owner only) |
| DELETE | `/data/{id}` | JWT | Delete data item (owner only) |
| GET | `/files/presign?operation=get&key=...` | JWT | Get presigned S3 GET URL |
| POST | `/files/presign?operation=put&key=...` | JWT | Get presigned S3 PUT URL |

## Authentication

- **Cognito User Pool** — email-based sign-up/sign-in
- **JWT Access Token** — passed in `Authorization: Bearer <token>` header
- **Custom Authorizer Lambda** — validates JWT via `jose` library (~1ms overhead)
- **Token Expiry:** Access token: 1 hour, Refresh token: 30 days

## Tech Stack

- **Runtime:** Node.js 20, TypeScript strict mode
- **Cloud:** AWS Lambda, API Gateway (HTTP API), DynamoDB, Cognito, S3
- **IaC:** AWS CDK (TypeScript)
- **Validation:** Zod (runtime schema validation at Lambda entry)
- **Observability:** CloudWatch Logs (JSON structured), X-Ray tracing
- **Testing:** Jest

## Quality Guarantees

| Metric | Target |
|--------|--------|
| Lambda cold start | < 500ms |
| API p99 latency | < 2000ms |
| API error rate | < 0.5% |
| DynamoDB billing mode | On-demand (scales to zero) |
| Base cost at idle | ~$0 (Lambda + DynamoDB on-demand) |
| CI pipeline | 100% test pass rate |
| Zod schema coverage | 100% of Lambda inputs validated |

## Getting Started

### Prerequisites

- Node.js 20+
- AWS CLI configured (`aws configure`)
- AWS CDK (`npm install -g aws-cdk`)

### Setup

```bash
# Clone and install
npm install

# Build
npm run build

# Deploy dev environment
cdk deploy --context env=dev --profile <aws-profile>
```

### Environment Variables

```bash
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_xxxxx
COGNITO_APP_CLIENT_ID=xxxxx
DYNAMODB_TABLE_NAME=serverless-backend-dev
S3_BUCKET_NAME=serverless-backend-dev-assets
```

## Environments

| Env | Stage | Notes |
|-----|-------|-------|
| dev | Development | Direct deploy, no approval |
| staging | Staging | Manual approval gate |
| prod | Production | Requires explicit approval |

## Deployment

```bash
# Dev
cdk deploy --context env=dev

# Staging (with approval)
cdk deploy --context env=staging --require-approval

# Production
cdk deploy --context env=prod --require-approval
```