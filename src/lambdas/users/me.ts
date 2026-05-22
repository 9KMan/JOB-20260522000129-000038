import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, USERS_TABLE } from '../lib/dynamodb';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, ValidationError } from './common';

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

    const getCommand = new GetCommand({
      TableName: USERS_TABLE,
      Key: { user_id: userId },
    });

    const result = await docClient.send(getCommand);

    if (!result.Item) {
      return createResponse(404, {
        success: false,
        error: { code: 404, message: 'User not found' },
      });
    }

    return createResponse(200, {
      success: true,
      data: result.Item,
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    return createResponse(500, {
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
}