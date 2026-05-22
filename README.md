# Serverless Backend

Production-grade serverless backend using AWS Lambda + API Gateway + DynamoDB + Cognito.

## Architecture

- **Auth**: Cognito User Pool with JWT tokens
- **API**: API Gateway HTTP API with Lambda integrations
- **Database**: DynamoDB with single-table design
- **Storage**: S3 with presigned URLs
- **IaC**: AWS CDK (TypeScript)
- **CI/CD**: GitHub Actions

## Getting Started

### Prerequisites

- Node.js 20+
- AWS CLI configured
- AWS CDK

### Setup

```bash
npm install
npm run build
cdk synth
cdk deploy --context env=dev
```

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/signup | None | Register new user |
| POST | /auth/signin | None | Login |
| POST | /auth/refresh | None | Refresh token |
| GET | /users/me | JWT | Get current user |
| PUT | /users/me | JWT | Update current user |
| GET | /data | JWT | List data (paginated) |
| POST | /data | JWT | Create data item |
| GET | /data/{id} | JWT | Get data item |
| PUT | /data/{id} | JWT | Update data item |
| DELETE | /data/{id} | JWT | Delete data item |
| GET | /files/presign | JWT | Get presigned URL |
| POST | /files/presign | JWT | Create presigned URL |

## Environments

- **dev**: Development environment
- **staging**: Staging with manual approval
- **prod**: Production deployment

## License

MIT