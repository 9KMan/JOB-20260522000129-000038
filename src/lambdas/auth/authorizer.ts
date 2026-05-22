import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { JWK } from 'jose/dist/types/jwk';

const COGNITO_REGION = process.env.COGNITO_REGION || 'us-east-1';
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const COGNITO_ISSUER = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${USER_POOL_ID}`;
const JWKS_URI = `${COGNITO_ISSUER}/.well-known/jwks.json`;

// Cache the JWKS
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(JWKS_URI));
  }
  return jwks;
}

function createResponse(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {
      principalId: 'anonymous',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: '*',
          },
        ],
      },
    });
  }

  try {
    const token = event.headers?.Authorization || event.headers?.authorization;

    if (!token) {
      return createResponse(401, {
        success: false,
        error: { code: 401, message: 'Missing authorization token' },
      });
    }

    // Remove 'Bearer ' prefix if present
    const tokenValue = token.startsWith('Bearer ') ? token.slice(7) : token;

    const { payload } = await jwtVerify(tokenValue, getJWKS(), {
      issuer: COGNITO_ISSUER,
    });

    const claims = payload as JWTPayload & {
      sub: string;
      email?: string;
      scope?: string;
    };

    const principalId = claims.sub;
    const email = claims.email;
    const scope = claims.scope || 'authenticated';

    const policyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: event.methodArn,
        },
      ],
    };

    return createResponse(200, {
      principalId,
      context: {
        sub: claims.sub,
        email,
        scope,
      },
      policyDocument,
    });
  } catch (error: any) {
    console.error('Authorizer error:', error);
    return createResponse(401, {
      success: false,
      error: { code: 401, message: 'Invalid or expired token' },
    });
  }
}