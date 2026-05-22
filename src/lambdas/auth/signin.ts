import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminInitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { SignInSchema } from './schemas';
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
    const { email, password } = validateBody(SignInSchema, event.body);

    const authCommand = new AdminInitiateAuthCommand({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    const authResponse = await cognito.send(authCommand);

    const accessToken = authResponse.AuthenticationResult?.AccessToken;
    const refreshToken = authResponse.AuthenticationResult?.RefreshToken;
    const expiresIn = authResponse.AuthenticationResult?.ExpiresIn;

    if (!accessToken) {
      return createResponse(401, {
        success: false,
        error: { code: 401, message: 'Invalid credentials' },
      });
    }

    return createResponse(200, {
      success: true,
      data: {
        accessToken,
        refreshToken,
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
    console.error('Signin error:', error);
    return createResponse(401, {
      success: false,
      error: { code: 401, message: 'Invalid credentials' },
    });
  }
}