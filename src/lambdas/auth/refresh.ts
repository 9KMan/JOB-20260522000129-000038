import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminInitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { RefreshSchema } from './schemas';
import { validateBody, ValidationError } from './common';

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CLIENT_ID = process.env.CLIENT_ID || '';

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
    return createResponse(200, { success: true });
  }

  try {
    const { refreshToken } = validateBody(RefreshSchema, event.body);

    const authCommand = new AdminInitiateAuthCommand({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    });

    const authResponse = await cognito.send(authCommand);

    const accessToken = authResponse.AuthenticationResult?.AccessToken;
    const expiresIn = authResponse.AuthenticationResult?.ExpiresIn;

    if (!accessToken) {
      return createResponse(401, {
        success: false,
        error: { code: 401, message: 'Invalid refresh token' },
      });
    }

    return createResponse(200, {
      success: true,
      data: {
        accessToken,
        expiresIn,
      },
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return createResponse(400, {
        success: false,
        error: { code: 400, message: error.message },
      });
    }
    console.error('Refresh error:', error);
    return createResponse(401, {
      success: false,
      error: { code: 401, message: 'Invalid refresh token' },
    });
  }
}