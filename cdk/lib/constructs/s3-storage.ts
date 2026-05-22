import { Bucket, BucketProps, BlockPublicAccess, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Duration, Stack } from 'aws-cdk-lib/core';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface S3StorageProps {
  environment: string;
  encryptionKey?: kms.Key;
}

export class S3Storage {
  public readonly bucket: Bucket;
  public readonly presignedUrlFunction: lambda.IFunction;

  constructor(scope: Stack, id: string, props: S3StorageProps) {
    const { environment, encryptionKey } = props;

    // Create KMS key if not provided
    const key = encryptionKey || new kms.Key(scope, `${id}-s3-kms-key`, {
      description: `KMS key for S3 bucket in ${environment}`,
      removalPolicy: 'retain',
    });

    // Create private S3 bucket
    this.bucket = new Bucket(scope, `${id}-assets-bucket`, {
      bucketName: `serverless-backend-assets-${environment}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.KMS,
      encryptionKey: key,
      versioned: true,
      lifecycleRules: [
        {
          id: 'cleanup-incomplete-uploads',
          enabled: true,
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
        {
          id: 'archive-old-versions',
          enabled: true,
          noncurrentVersionTransitions: [
            {
              transitionAfter: Duration.days(30),
              storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
            },
          ],
          noncurrentVersionsToRetain: 10,
        },
      ],
    });

    // Create Lambda function for presigned URLs
    const presignedUrlRole = new iam.Role(scope, `${id}-presigned-url-role`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: `serverless-backend-presigned-url-${environment}`,
    });

    presignedUrlRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
          's3:PutObjectAcl',
        ],
        resources: [`${this.bucket.bucketArn}/*`],
      })
    );

    presignedUrlRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['arn:aws:logs:*:*:*'],
      })
    );

    this.presignedUrlFunction = new lambda.Function(scope, `${id}-presigned-url-function`, {
      functionName: `serverless-backend-presigned-url-${environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: Duration.seconds(10),
      code: lambda.Code.fromInline(`
        const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

        const s3Client = new S3Client({});
        const BUCKET_NAME = process.env.BUCKET_NAME;

        exports.handler = async (event) => {
          const { action, key, expiresIn = 3600 } = JSON.parse(event.body || '{}');

          let command;
          switch (action) {
            case 'upload':
              command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key });
              break;
            case 'download':
              command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
              break;
            default:
              return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid action. Use "upload" or "download"' }),
              };
          }

          const url = await getSignedUrl(s3Client, command, { expiresIn });
          return {
            statusCode: 200,
            body: JSON.stringify({ url }),
          };
        };
      `),
      handler: 'index.handler',
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
      },
      role: presignedUrlRole,
      tracing: lambda.Tracing.ACTIVE,
    });
  }

  public grantReadWrite(role: iam.IRole) {
    this.bucket.grantReadWrite(role);
  }
}