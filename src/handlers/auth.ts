import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, SignUpCommand, ConfirmSignUpCommand, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { z } from 'zod';
import { successResponse, errorResponse } from '../lib/response';
import { parseBody, formatZodError } from '../lib/validation';

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient({});

// Validation schemas
const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

const confirmSignUpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Sign up new user
export async function signUp(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const data = parseBody(signUpSchema, event.body);

    const command = new SignUpCommand({
      ClientId: process.env.APP_CLIENT_ID!,
      Username: data.email,
      Password: data.password,
      UserAttributes: [
        { Name: 'email', Value: data.email },
        { Name: 'name', Value: data.name },
      ],
    });

    const result = await cognitoClient.send(command);

    return successResponse({
      userSub: result.UserSub,
      message: 'User signed up successfully. Please confirm your email.',
    }, 201);
  } catch (error) {
    console.error('Error signing up:', error);
    return errorResponse('AUTH_ERROR', 'Failed to sign up', 500);
  }
}

// Confirm sign up
export async function confirmSignUp(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const data = parseBody(confirmSignUpSchema, event.body);

    const command = new ConfirmSignUpCommand({
      ClientId: process.env.APP_CLIENT_ID!,
      Username: data.email,
      ConfirmationCode: data.code,
    });

    await cognitoClient.send(command);

    return successResponse({ message: 'Email confirmed successfully' });
  } catch (error) {
    console.error('Error confirming sign up:', error);
    return errorResponse('AUTH_ERROR', 'Failed to confirm sign up', 500);
  }
}

// Sign in
export async function signIn(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const data = parseBody(signInSchema, event.body);

    const command = new InitiateAuthCommand({
      ClientId: process.env.APP_CLIENT_ID!,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: data.email,
        PASSWORD: data.password,
      },
    });

    const result = await cognitoClient.send(command);

    return successResponse({
      accessToken: result.AuthenticationResult?.AccessToken,
      idToken: result.AuthenticationResult?.IdToken,
      refreshToken: result.AuthenticationResult?.RefreshToken,
      expiresIn: result.AuthenticationResult?.ExpiresIn,
    });
  } catch (error) {
    console.error('Error signing in:', error);
    return errorResponse('AUTH_ERROR', 'Invalid credentials', 401);
  }
}

// Handler exports for Lambda
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  const path = event.path;

  try {
    if (path.endsWith('/auth/signup') && method === 'POST') {
      return signUp(event);
    }
    if (path.endsWith('/auth/confirm') && method === 'POST') {
      return confirmSignUp(event);
    }
    if (path.endsWith('/auth/signin') && method === 'POST') {
      return signIn(event);
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', 404);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('VALIDATION_ERROR', formatZodError(error), 400);
    }
    console.error('Unhandled error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
};