import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, DATA_TABLE } from '../lib/dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { CreateDataSchema } from './schemas';
import { validateBody, getUserIdFromEvent, ValidationError } from './common';
import { v4 as uuidv4 } from 'uuid';

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

    const { type, payload } = validateBody(CreateDataSchema, event.body);

    const id = uuidv4();
    const now = new Date().toISOString();

    const item = {
      id,
      user_id: userId,
      type,
      payload,
      createdAt: now,
      updatedAt: now,
    };

    const putCommand = new PutCommand({
      TableName: DATA_TABLE,
      Item: item,
    });

    await docClient.send(putCommand);

    return createResponse(201, {
      success: true,
      data: item,
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return createResponse(400, {
        success: false,
        error: { code: 400, message: error.message },
      });
    }
    console.error('Create data error:', error);
    return createResponse(500, {
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
}