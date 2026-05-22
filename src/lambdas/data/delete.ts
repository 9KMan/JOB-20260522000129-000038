import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, DATA_TABLE } from '../lib/dynamodb';
import { GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
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

    const deleteCommand = new DeleteCommand({
      TableName: DATA_TABLE,
      Key: { id: dataId },
    });

    await docClient.send(deleteCommand);

    return createResponse(204, { success: true });
  } catch (error: any) {
    console.error('Delete data error:', error);
    return createResponse(500, {
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
}