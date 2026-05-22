import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, USERS_TABLE } from '../lib/dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { UpdateUserSchema } from './schemas';
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

    const updates = validateBody(UpdateUserSchema, event.body);

    if (!updates.name && !updates.email) {
      return createResponse(400, {
        success: false,
        error: { code: 400, message: 'At least one field (name or email) must be provided' },
      });
    }

    const updateExpression: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (updates.name) {
      updateExpression.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = updates.name;
    }

    if (updates.email) {
      updateExpression.push('#email = :email');
      expressionAttributeNames['#email'] = 'email';
      expressionAttributeValues[':email'] = updates.email;
    }

    updateExpression.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#name'] = 'name';
    expressionAttributeNames['#email'] = 'email';
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const updateCommand = new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { user_id: userId },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
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
    console.error('Update user error:', error);
    return createResponse(500, {
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
}