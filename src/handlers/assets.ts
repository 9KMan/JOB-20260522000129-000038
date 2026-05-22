import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { successResponse, errorResponse } from '../lib/response';
import { parseBody, formatZodError } from '../lib/validation';

// Initialize S3 client
const s3Client = new S3Client({});

// Validation schemas
const generateUploadUrlSchema = z.object({
  key: z.string().min(1).max(1024),
  contentType: z.string().optional(),
  expiresIn: z.number().min(60).max(3600).optional(),
});

const generateDownloadUrlSchema = z.object({
  key: z.string().min(1).max(1024),
  expiresIn: z.number().min(60).max(3600).optional(),
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

// Generate upload URL
export async function generateUploadUrl(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const data = parseBody(generateUploadUrlSchema, event.body);
    const key = `uploads/${userId}/${data.key}`;
    const expiresIn = data.expiresIn || 3600;

    const command = new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME!,
      Key: key,
      ContentType: data.contentType,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });

    return successResponse({
      url,
      key,
      expiresIn,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('VALIDATION_ERROR', formatZodError(error), 400);
    }
    console.error('Error generating upload URL:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to generate upload URL', 500);
  }
}

// Generate download URL
export async function generateDownloadUrl(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const data = parseBody(generateDownloadUrlSchema, event.body);
    const key = `uploads/${userId}/${data.key}`;
    const expiresIn = data.expiresIn || 3600;

    const command = new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME!,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });

    return successResponse({
      url,
      key,
      expiresIn,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('VALIDATION_ERROR', formatZodError(error), 400);
    }
    console.error('Error generating download URL:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to generate download URL', 500);
  }
}

// Delete asset
export async function deleteAsset(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const key = event.pathParameters?.key;
    if (!key) {
      return errorResponse('INVALID_PARAMETER', 'Key is required', 400);
    }

    // Ensure user can only delete their own assets
    const fullKey = `uploads/${userId}/${key}`;

    const command = new DeleteObjectCommand({
      Bucket: process.env.BUCKET_NAME!,
      Key: fullKey,
    });

    await s3Client.send(command);

    return successResponse({ message: 'Asset deleted successfully' });
  } catch (error) {
    console.error('Error deleting asset:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete asset', 500);
  }
}

// List assets
export async function listAssets(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // Note: In production, you might want to use S3 inventory or a separate DynamoDB table
    // to track assets. This is a simplified implementation.
    return successResponse({
      message: 'List assets endpoint - use DynamoDB tracking for production',
      prefix: `uploads/${userId}/`,
    });
  } catch (error) {
    console.error('Error listing assets:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to list assets', 500);
  }
}

// Handler exports for Lambda
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  const path = event.path;

  try {
    if (path.endsWith('/assets/upload') && method === 'POST') {
      return generateUploadUrl(event);
    }
    if (path.endsWith('/assets/download') && method === 'POST') {
      return generateDownloadUrl(event);
    }
    if (path.match(/\/assets\/[^/]+$/) && method === 'DELETE') {
      return deleteAsset(event);
    }
    if (path.endsWith('/assets') && method === 'GET') {
      return listAssets(event);
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', 404);
  } catch (error) {
    console.error('Unhandled error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
};