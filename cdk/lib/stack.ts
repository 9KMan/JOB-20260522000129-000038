import { Stack, Duration, CfnOutput, Environment } from 'aws-cdk-lib/core';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { DynamoDBTables } from './constructs/dynamodb-tables';
import { CognitoAuth } from './constructs/cognito-auth';
import { S3Storage } from './constructs/s3-storage';
import { LambdaFunction } from './constructs/lambda-function';
import { ApiGateway } from './constructs/api-gateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

export interface ServerlessBackendStackProps {
  environment: string;
}

export class ServerlessBackendStack extends Stack {
  public readonly usersTableName: CfnOutput;
  public readonly dataTableName: CfnOutput;
  public readonly apiEndpoint: CfnOutput;
  public readonly userPoolId: CfnOutput;
  public readonly appClientId: CfnOutput;
  public readonly s3BucketName: CfnOutput;

  constructor(scope: any, id: string, props: ServerlessBackendStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Create shared KMS key
    const sharedKey = new iam.Role(this, 'shared-kms-key', {
      assumedBy: new iam.ServicePrincipal('kms.amazonaws.com'),
      roleName: `serverless-backend-shared-key-${environment}`,
    }).node.findChild('Resource') as unknown as iam.IRole;

    // Initialize constructs
    const cognitoAuth = new CognitoAuth(this, 'cognito', { environment });
    const dynamoTables = new DynamoDBTables(this, 'dynamodb', { environment });
    const s3Storage = new S3Storage(this, 's3', { environment });

    // Store context for API gateway
    this.node.setContext('cognitoAppClientId', cognitoAuth.appClientId);

    // Create Lambda functions
    const userHandler = new LambdaFunction(this, 'user-handler', {
      functionName: `serverless-backend-users-${environment}`,
      entry: path.join(__dirname, '../../src/handlers/users.ts'),
      description: 'User management Lambda function',
      environment: {
        USERS_TABLE: dynamoTables.usersTable.tableName,
        USER_EMAIL_INDEX: 'email-index',
      },
    });

    const dataHandler = new LambdaFunction(this, 'data-handler', {
      functionName: `serverless-backend-data-${environment}`,
      entry: path.join(__dirname, '../../src/handlers/data.ts'),
      description: 'Data management Lambda function',
      environment: {
        DATA_TABLE: dynamoTables.dataTable.tableName,
        USER_INDEX: 'user-index',
      },
    });

    const authHandler = new LambdaFunction(this, 'auth-handler', {
      functionName: `serverless-backend-auth-${environment}`,
      entry: path.join(__dirname, '../../src/handlers/auth.ts'),
      description: 'Authentication Lambda function',
      environment: {
        USER_POOL_ID: cognitoAuth.userPoolId,
        APP_CLIENT_ID: cognitoAuth.appClientId,
      },
    });

    const assetHandler = new LambdaFunction(this, 'asset-handler', {
      functionName: `serverless-backend-assets-${environment}`,
      entry: path.join(__dirname, '../../src/handlers/assets.ts'),
      description: 'Asset management Lambda function',
      environment: {
        BUCKET_NAME: s3Storage.bucket.bucketName,
        PRESIGNED_URL_FUNCTION: s3Storage.presignedUrlFunction.functionName,
      },
    });

    // Grant DynamoDB permissions
    dynamoTables.grantReadWrite(userHandler.role!);
    dynamoTables.grantReadWrite(dataHandler.role!);

    // Grant S3 permissions
    s3Storage.bucket.grantReadWrite(assetHandler.role!);

    // Create API Gateway
    const apiGateway = new ApiGateway(this, 'api', {
      environment,
      userPoolArn: cognitoAuth.userPool.userPoolArn,
    });

    // Add routes with Lambda integrations
    apiGateway.httpApi.addRoutes({
      path: '/auth/{proxy+}',
      methods: [import('@aws-cdk/aws-apigatewayv2').HttpMethod.ANY],
      integration: new (require('aws-cdk-lib/aws-apigatewayv2-integrations').HttpLambdaIntegration)(
        'auth-integration',
        authHandler.functionArn
      ),
    });

    apiGateway.httpApi.addRoutes({
      path: '/users/{proxy+}',
      methods: [import('@aws-cdk/aws-apigatewayv2').HttpMethod.ANY],
      integration: new (require('aws-cdk-lib/aws-apigatewayv2-integrations').HttpLambdaIntegration)(
        'users-integration',
        userHandler.functionArn
      ),
    });

    apiGateway.httpApi.addRoutes({
      path: '/data/{proxy+}',
      methods: [import('@aws-cdk/aws-apigatewayv2').HttpMethod.ANY],
      integration: new (require('aws-cdk-lib/aws-apigatewayv2-integrations').HttpLambdaIntegration)(
        'data-integration',
        dataHandler.functionArn
      ),
    });

    apiGateway.httpApi.addRoutes({
      path: '/assets/{proxy+}',
      methods: [import('@aws-cdk/aws-apigatewayv2').HttpMethod.ANY],
      integration: new (require('aws-cdk-lib/aws-apigatewayv2-integrations').HttpLambdaIntegration)(
        'assets-integration',
        assetHandler.functionArn
      ),
    });

    // Create CloudWatch Alarms
    const errorAlarm = new cw.CfnAlarm(this, 'error-alarm', {
      alarmName: `serverless-backend-errors-${environment}`,
      metricName: 'Errors',
      namespace: 'AWS/Lambda',
      statistic: 'Sum',
      period: Duration.minutes(1).toSeconds(),
      threshold: 5,
      evaluationPeriods: 1,
      alarmActions: [],
    });

    const latencyAlarm = new cw.CfnAlarm(this, 'latency-alarm', {
      alarmName: `serverless-backend-latency-${environment}`,
      metricName: 'Duration',
      namespace: 'AWS/Lambda',
      statistic: 'Average',
      period: Duration.minutes(1).toSeconds(),
      threshold: 1000,
      evaluationPeriods: 3,
      alarmActions: [],
    });

    // Enable X-Ray tracing on API Gateway
    apiGateway.httpApi.node.findChild('DefaultStage')?.node.findChild('Resource')?.addPropertyOverride('TracingEnabled', true);

    // Outputs
    this.usersTableName = new CfnOutput(this, 'UsersTableName', {
      value: dynamoTables.usersTable.tableName,
      exportName: `serverless-backend-users-table-${environment}`,
    });

    this.dataTableName = new CfnOutput(this, 'DataTableName', {
      value: dynamoTables.dataTable.tableName,
      exportName: `serverless-backend-data-table-${environment}`,
    });

    this.apiEndpoint = new CfnOutput(this, 'ApiEndpoint', {
      value: apiGateway.httpApi.apiEndpoint,
      exportName: `serverless-backend-api-${environment}`,
    });

    this.userPoolId = new CfnOutput(this, 'UserPoolId', {
      value: cognitoAuth.userPoolId,
      exportName: `serverless-backend-user-pool-${environment}`,
    });

    this.appClientId = new CfnOutput(this, 'AppClientId', {
      value: cognitoAuth.appClientId,
      exportName: `serverless-backend-app-client-${environment}`,
    });

    this.s3BucketName = new CfnOutput(this, 'S3BucketName', {
      value: s3Storage.bucket.bucketName,
      exportName: `serverless-backend-bucket-${environment}`,
    });
  }
}