import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, DATA_TABLE } from '../lib/dynamodb';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { UpdateDataSchema } from './schemas';
import { validateBody, getUserIdFromEvent, ValidationError } from './common';

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
    let userId: string;
    try {
      userId = getUserIdFromEvent(event);
    } catch (error) {
      return createResponse(401, {
        success: false,
        error: { code: 401, message: 'Unauthorized' },
      });
    }

    const dataId = event.pathParameters?.id;

    if (!dataId) {
      return createResponse(400, {
        success: false,
        error: { code: 400, message: 'Data ID is required' },
      });
    }

    // First check if the item exists and verify ownership
    const getCommand = new GetCommand({
      TableName: DATA_TABLE,
      Key: { id: dataId },
    });

    const existingResult = await docClient.send(getCommand);

    if (!existingResult.Item) {
      return createResponse(404, {
        success: false,
        error: { code: 404, message: 'Data not found' },
      });
    }

    if (existingResult.Item.user_id !== userId) {
      return createResponse(403, {
        success: false,
        error: { code: 403, message: 'Not authorized to access this resource' },
      });
    }

    const updates = validateBody(UpdateDataSchema, event.body);

    if (!updates.type && !updates.payload) {
      return createResponse(400, {
        success: false,
        error: { code: 400, message: 'At least one field (type or payload) must be provided' },
      });
    }

    const updateExpression: string[] = [];
    const expressionAttributeValues: Record<string, any> = {};

    if (updates.type) {
      updateExpression.push('#type = :type');
      expressionAttributeValues[':type'] = updates.type;
    }

    if (updates.payload) {
      updateExpression.push('#payload = :payload');
      expressionAttributeValues[':payload'] = updates.payload;
    }

    updateExpression.push('#updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const updateCommand = new UpdateCommand({
      TableName: DATA_TABLE,
      Key: { id: dataId },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: {
        '#type': 'type',
        '#payload': 'payload',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    const result = await docClient.send(updateCommand);

    return createResponse(200, {
      success: true,
      data: result.Attributes,
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return createResponse(400, {
        success: false,
        error: { code: 400, message: error.message },
      });
    }
    console.error('Update data error:', error);
    return createResponse(500, {
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
}