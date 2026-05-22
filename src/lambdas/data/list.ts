import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, DATA_TABLE, USER_DATA_INDEX } from '../lib/dynamodb';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getUserIdFromEvent, ValidationError } from './common';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

    const queryParams = event.queryStringParameters || {};
    let limit = parseInt(queryParams.limit || String(DEFAULT_LIMIT), 10);
    if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    const exclusiveStartKey = queryParams.nextToken
      ? JSON.parse(Buffer.from(queryParams.nextToken, 'base64').toString('utf-8'))
      : undefined;

    const queryCommand = new QueryCommand({
      TableName: DATA_TABLE,
      IndexName: USER_DATA_INDEX,
      KeyConditionExpression: 'user_id = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    });

    const result = await docClient.send(queryCommand);

    const items = result.Items || [];
    let nextToken: string | undefined;

    if (result.LastEvaluatedKey) {
      nextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }

    return createResponse(200, {
      success: true,
      data: {
        items,
        nextToken,
      },
    });
  } catch (error: any) {
    console.error('List data error:', error);
    return createResponse(500, {
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
}