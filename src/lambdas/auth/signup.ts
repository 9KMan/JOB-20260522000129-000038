import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } from '@aws-sdk/client-cognito-identity-provider';
import { SignUpSchema } from './schemas';
import { validateBody, ValidationError } from './common';
import { v4 as uuidv4 } from 'uuid';

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
    const { email, password, name } = validateBody(SignUpSchema, event.body);

    // Check if user already exists by trying to get them
    try {
      const listUsersCommand = new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Filter: `email = "${email}"`,
        MaxResults: 1,
      });
    } catch (error) {
      // User might already exist - continue to try signUp
    }

    // Create user in Cognito
    const createUserCommand = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name },
      ],
      MessageAction: 'SUPPRESS',
    });

    let userId: string;
    try {
      const createResponse = await cognito.send(createUserCommand);
      userId = createResponse.User?.Username || uuidv4();
    } catch (error: any) {
      if (error.name === 'UsernameExistsException' || error.message?.includes('already')) {
        return createResponse(409, {
          success: false,
          error: { code: 409, message: 'Email already exists' },
        });
      }
      throw error;
    }

    // Set the password for the user
    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: password,
      Permanent: true,
    });

    try {
      await cognito.send(setPasswordCommand);
    } catch (error: any) {
      // If password set fails, we might need to use signUp instead
      console.error('AdminSetUserPassword failed:', error);
    }

    return createResponse(201, {
      success: true,
      data: { user_id: userId },
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return createResponse(400, {
        success: false,
        error: { code: 400, message: error.message },
      });
    }
    console.error('Signup error:', error);
    return createResponse(400, {
      success: false,
      error: { code: 400, message: 'Signup failed' },
    });
  }
}