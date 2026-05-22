import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client);

export const USERS_TABLE = process.env.USERS_TABLE || 'Users';
export const DATA_TABLE = process.env.DATA_TABLE || 'Data';
export const USER_DATA_INDEX = process.env.USER_DATA_INDEX || 'user_id-index';