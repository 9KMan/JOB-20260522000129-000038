import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { ZodSchema, z } from 'zod';
import { docClient } from '../lib/dynamodb';
import { successResponse, errorResponse } from '../lib/response';
import { parseBody, formatZodError } from '../lib/validation';
import { JwtClaims } from '../types';

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(100).optional(),
});

// Helper to get user from JWT
function getUserFromEvent(event: APIGatewayProxyEvent): JwtClaims | null {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  try {
    const token = authHeader.split(' ')[1];
    const payload = Buffer.from(token.split('.')[1], 'base64').toString();
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

// Get user by ID
export async function getUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return errorResponse('INVALID_PARAMETER', 'User ID is required', 400);
    }

    const result = await docClient.get({
      TableName: process.env.USERS_TABLE!,
      Key: { user_id: userId },
    });

    if (!result.Item) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }

    return successResponse(result.Item);
  } catch (error) {
    console.error('Error getting user:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get user', 500);
  }
}

// List users (admin only)
export async function listUsers(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const user = getUserFromEvent(event);
    if (!user || user['cognito:username'] !== 'admin') {
      return errorResponse('UNAUTHORIZED', 'Admin access required', 403);
    }

    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 50;
    const exclusiveStartKey = event.queryStringParameters?.nextToken
      ? JSON.parse(Buffer.from(event.queryStringParameters.nextToken, 'base64').toString())
      : undefined;

    const result = await docClient.scan({
      TableName: process.env.USERS_TABLE!,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    });

    const nextToken = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined;

    return successResponse({ items: result.Items, nextToken });
  } catch (error) {
    console.error('Error listing users:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to list users', 500);
  }
}

// Create user
export async function createUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const user = getUserFromEvent(event);
    if (!user) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const data = parseBody(createUserSchema, event.body);
    const now = new Date().toISOString();

    const newUser = {
      user_id: uuidv4(),
      email: data.email,
      name: data.name,
      role: 'user' as const,
      created_at: now,
      updated_at: now,
    };

    await docClient.put({
      TableName: process.env.USERS_TABLE!,
      Item: newUser,
      ConditionExpression: 'attribute_not_exists(user_id)',
    });

    return successResponse(newUser, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('VALIDATION_ERROR', formatZodError(error), 400);
    }
    console.error('Error creating user:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create user', 500);
  }
}

// Update user
export async function updateUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const user = getUserFromEvent(event);
    if (!user) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const userId = event.pathParameters?.userId;
    if (!userId) {
      return errorResponse('INVALID_PARAMETER', 'User ID is required', 400);
    }

    // Users can only update their own profile unless admin
    if (user.sub !== userId && user['cognito:username'] !== 'admin') {
      return errorResponse('FORBIDDEN', 'Cannot update other users', 403);
    }

    const data = parseBody(updateUserSchema, event.body);
    const now = new Date().toISOString();

    const updateExpression = 'SET updated_at = :now';
    const expressionValues: Record<string, any> = { ':now': now };
    const expressionNames: Record<string, string> = {};

    if (data.email) {
      expressionNames['#email'] = 'email';
      updateExpression += ', #email = :email';
      expressionValues[':email'] = data.email;
    }
    if (data.name) {
      updateExpression += ', #name = :name';
      expressionValues[':name'] = data.name;
      expressionNames['#name'] = 'name';
    }

    const result = await docClient.update({
      TableName: process.env.USERS_TABLE!,
      Key: { user_id: userId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: Object.keys(expressionNames).length > 0 ? expressionNames : undefined,
      ExpressionAttributeValues: expressionValues,
      ConditionExpression: 'attribute_exists(user_id)',
      ReturnValues: 'ALL_NEW',
    });

    return successResponse(result.Attributes);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('VALIDATION_ERROR', formatZodError(error), 400);
    }
    console.error('Error updating user:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to update user', 500);
  }
}

// Delete user (admin only)
export async function deleteUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const user = getUserFromEvent(event);
    if (!user || user['cognito:username'] !== 'admin') {
      return errorResponse('UNAUTHORIZED', 'Admin access required', 403);
    }

    const userId = event.pathParameters?.userId;
    if (!userId) {
      return errorResponse('INVALID_PARAMETER', 'User ID is required', 400);
    }

    await docClient.delete({
      TableName: process.env.USERS_TABLE!,
      Key: { user_id: userId },
    });

    return successResponse({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete user', 500);
  }
}

// Handler exports for Lambda
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  const path = event.path;

  try {
    if (path.endsWith('/users') && method === 'GET') {
      return listUsers(event);
    }
    if (path.endsWith('/users') && method === 'POST') {
      return createUser(event);
    }
    if (path.match(/\/users\/[^/]+$/) && method === 'GET') {
      return getUser(event);
    }
    if (path.match(/\/users\/[^/]+$/) && method === 'PUT') {
      return updateUser(event);
    }
    if (path.match(/\/users\/[^/]+$/) && method === 'DELETE') {
      return deleteUser(event);
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', 404);
  } catch (error) {
    console.error('Unhandled error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
};