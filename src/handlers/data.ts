import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { docClient } from '../lib/dynamodb';
import { successResponse, errorResponse } from '../lib/response';
import { parseBody, formatZodError } from '../lib/validation';

// Validation schemas
const createDataSchema = z.object({
  type: z.string().min(1).max(50),
  payload: z.record(z.unknown()),
});

const updateDataSchema = z.object({
  type: z.string().min(1).max(50).optional(),
  payload: z.record(z.unknown()).optional(),
});

// Helper to get user ID from JWT
function getUserIdFromEvent(event: APIGatewayProxyEvent): string | null {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  try {
    const token = authHeader.split(' ')[1];
    const payload = Buffer.from(token.split('.')[1], 'base64').toString();
    const claims = JSON.parse(payload);
    return claims.sub;
  } catch {
    return null;
  }
}

// Get data item by ID
export async function getData(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const dataId = event.pathParameters?.dataId;
    if (!dataId) {
      return errorResponse('INVALID_PARAMETER', 'Data ID is required', 400);
    }

    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const result = await docClient.get({
      TableName: process.env.DATA_TABLE!,
      Key: { id: dataId },
    });

    if (!result.Item) {
      return errorResponse('NOT_FOUND', 'Data item not found', 404);
    }

    // Users can only access their own data unless admin
    if (result.Item.user_id !== userId) {
      return errorResponse('FORBIDDEN', 'Access denied', 403);
    }

    return successResponse(result.Item);
  } catch (error) {
    console.error('Error getting data:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get data', 500);
  }
}

// List data items for current user
export async function listData(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 50;
    const exclusiveStartKey = event.queryStringParameters?.nextToken
      ? JSON.parse(Buffer.from(event.queryStringParameters.nextToken, 'base64').toString())
      : undefined;

    // Query using user_id index
    const result = await docClient.query({
      TableName: process.env.DATA_TABLE!,
      IndexName: process.env.USER_INDEX!,
      KeyConditionExpression: 'user_id = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
      ScanIndexForward: false, // Most recent first
    });

    const nextToken = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined;

    return successResponse({ items: result.Items, nextToken });
  } catch (error) {
    console.error('Error listing data:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to list data', 500);
  }
}

// Create data item
export async function createData(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const data = parseBody(createDataSchema, event.body);
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60); // 90 days

    const newItem = {
      id: uuidv4(),
      user_id: userId,
      type: data.type,
      payload: data.payload,
      created_at: now,
      updated_at: now,
      ttl,
    };

    await docClient.put({
      TableName: process.env.DATA_TABLE!,
      Item: newItem,
    });

    return successResponse(newItem, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('VALIDATION_ERROR', formatZodError(error), 400);
    }
    console.error('Error creating data:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create data', 500);
  }
}

// Update data item
export async function updateData(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const dataId = event.pathParameters?.dataId;
    if (!dataId) {
      return errorResponse('INVALID_PARAMETER', 'Data ID is required', 400);
    }

    // First check ownership
    const existing = await docClient.get({
      TableName: process.env.DATA_TABLE!,
      Key: { id: dataId },
    });

    if (!existing.Item) {
      return errorResponse('NOT_FOUND', 'Data item not found', 404);
    }

    if (existing.Item.user_id !== userId) {
      return errorResponse('FORBIDDEN', 'Access denied', 403);
    }

    const data = parseBody(updateDataSchema, event.body);
    const now = new Date().toISOString();

    const updateParts: string[] = ['updated_at = :now'];
    const expressionValues: Record<string, any> = { ':now': now };

    if (data.type) {
      updateParts.push('`type` = :type');
      expressionValues[':type'] = data.type;
    }
    if (data.payload) {
      updateParts.push('payload = :payload');
      expressionValues[':payload'] = data.payload;
    }

    const result = await docClient.update({
      TableName: process.env.DATA_TABLE!,
      Key: { id: dataId },
      UpdateExpression: 'SET ' + updateParts.join(', '),
      ExpressionAttributeValues: expressionValues,
      ConditionExpression: 'attribute_exists(id)',
      ReturnValues: 'ALL_NEW',
    });

    return successResponse(result.Attributes);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('VALIDATION_ERROR', formatZodError(error), 400);
    }
    console.error('Error updating data:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to update data', 500);
  }
}

// Delete data item
export async function deleteData(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const dataId = event.pathParameters?.dataId;
    if (!dataId) {
      return errorResponse('INVALID_PARAMETER', 'Data ID is required', 400);
    }

    // Check ownership before delete
    const existing = await docClient.get({
      TableName: process.env.DATA_TABLE!,
      Key: { id: dataId },
    });

    if (!existing.Item) {
      return errorResponse('NOT_FOUND', 'Data item not found', 404);
    }

    if (existing.Item.user_id !== userId) {
      return errorResponse('FORBIDDEN', 'Access denied', 403);
    }

    await docClient.delete({
      TableName: process.env.DATA_TABLE!,
      Key: { id: dataId },
    });

    return successResponse({ message: 'Data item deleted successfully' });
  } catch (error) {
    console.error('Error deleting data:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete data', 500);
  }
}

// Handler exports for Lambda
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  const path = event.path;

  try {
    if (path.match(/\/data$/) && method === 'GET') {
      return listData(event);
    }
    if (path.match(/\/data$/) && method === 'POST') {
      return createData(event);
    }
    if (path.match(/\/data\/[^/]+$/) && method === 'GET') {
      return getData(event);
    }
    if (path.match(/\/data\/[^/]+$/) && method === 'PUT') {
      return updateData(event);
    }
    if (path.match(/\/data\/[^/]+$/) && method === 'DELETE') {
      return deleteData(event);
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', 404);
  } catch (error) {
    console.error('Unhandled error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
};