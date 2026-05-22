import { AttributeType, BillingMode, Table, ITable, StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { Duration, Stack } from 'aws-cdk-lib/core';
import * as kms from 'aws-cdk-lib/aws-kms';

export interface DynamoDBTablesProps {
  environment: string;
  encryptionKey?: kms.Key;
}

export class DynamoDBTables {
  public readonly usersTable: ITable;
  public readonly dataTable: ITable;

  constructor(scope: Stack, id: string, props: DynamoDBTablesProps) {
    const { environment, encryptionKey } = props;

    // Create KMS key for encryption at rest
    const key = encryptionKey || new kms.Key(scope, `${id}-kms-key`, {
      description: `KMS key for DynamoDB tables in ${environment}`,
      removalPolicy: 'retain',
    });

    // Users Table
    this.usersTable = new Table(scope, `${id}-users-table`, {
      tableName: `serverless-backend-users-${environment}`,
      partitionKey: {
        name: 'user_id',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: key,
      pointInTimeRecovery: true,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // Add email GSI for Users table
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: {
        name: 'email',
        type: AttributeType.STRING,
      },
      projectionType: 'ALL',
    });

    // Data Table
    this.dataTable = new Table(scope, `${id}-data-table`, {
      tableName: `serverless-backend-data-${environment}`,
      partitionKey: {
        name: 'id',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'created_at',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: key,
      pointInTimeRecovery: true,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      timeToLiveAttribute: 'ttl',
    });

    // Add user_id GSI for Data table
    this.dataTable.addGlobalSecondaryIndex({
      indexName: 'user-index',
      partitionKey: {
        name: 'user_id',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'created_at',
        type: AttributeType.STRING,
      },
      projectionType: 'ALL',
    });
  }

  public grantReadWrite(lambdaRole: iam.IRole) {
    this.usersTable.grantReadWriteData(lambdaRole);
    this.dataTable.grantReadWriteData(lambdaRole);
  }

  public grantRead(lambdaRole: iam.IRole) {
    this.usersTable.grantReadData(lambdaRole);
    this.dataTable.grantReadData(lambdaRole);
  }
}

// Import iam for grant methods
import * as iam from 'aws-cdk-lib/aws-iam';