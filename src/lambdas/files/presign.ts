import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PresignQuerySchema } from './schemas';
import { validateBody, validateQuery, getUserIdFromEvent, ValidationError } from './common';

const s3 = new S3Client({});
const BUCKET_NAME = process.env.S3_BUCKET_NAME || '';
const PRESIGN_EXPIRY = 3600;

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

    let operation: string;
    let key: string;

    if (event.httpMethod === 'GET') {
      // GET /files/presign?operation=get&key=filename
      const params = validateQuery(PresignQuerySchema, event.queryStringParameters);
      operation = params.operation;
      key = params.key;
    } else {
      // POST /files/presign with body
      const body = event.body ? JSON.parse(event.body) : {};
      if (!body.operation || !body.key) {
        return createResponse(400, {
          success: false,
          error: { code: 400, message: 'operation and key are required' },
        });
      }
      operation = body.operation;
      key = body.key;
    }

    // Validate operation is one we support
    if (operation !== 'get' && operation !== 'put') {
      return createResponse(400, {
        success: false,
        error: { code: 400, message: 'operation must be either "get" or "put"' },
      });
    }

    // Prefix key with user_id for namespace isolation
    const prefixedKey = `users/${userId}/${key}`;

    let url: string;

    if (operation === 'put') {
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: prefixedKey,
      });
      url = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRY });
    } else {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: prefixedKey,
      });
      url = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRY });
    }

    return createResponse(200, {
      success: true,
      data: {
        url,
        expiresIn: PRESIGN_EXPIRY,
        key: prefixedKey,
      },
    });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return createResponse(400, {
        success: false,
        error: { code: 400, message: error.message },
      });
    }
    console.error('Presign error:', error);
    return createResponse(500, {
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
}