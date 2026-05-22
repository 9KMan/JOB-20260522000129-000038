import { APIGatewayProxyResult } from 'aws-lambda';
import { ApiResponse } from '../types';

export function successResponse<T>(data: T, statusCode = 200): APIGatewayProxyResult {
  const response: ApiResponse<T> = { success: true, data };
  return {
    statusCode,
    body: JSON.stringify(response),
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
  };
}

export function errorResponse(code: string, message: string, statusCode = 400): APIGatewayProxyResult {
  const response: ApiResponse<null> = { success: false, error: { code, message } };
  return {
    statusCode,
    body: JSON.stringify(response),
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
  };
}