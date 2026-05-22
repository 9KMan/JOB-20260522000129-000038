import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { FunctionOptions, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { Duration, Stack } from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface LambdaFunctionProps {
  functionName: string;
  entry: string;
  handler?: string;
  environment?: Record<string, string>;
  description?: string;
}

export class LambdaFunction extends NodejsFunction {
  constructor(scope: Stack, id: string, props: LambdaFunctionProps) {
    const {
      functionName,
      entry,
      handler = 'handler',
      environment = {},
      description = '',
    } = props;

    super(scope, id, {
      functionName,
      entry,
      handler,
      runtime: Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: Duration.seconds(10),
      description,
      environment: {
        ...environment,
        NODE_ENV: scope.node.tryGetContext('environment') || 'dev',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
        externalModules: ['aws-sdk'],
      },
      tracing: Tracing.ACTIVE,
      logRetention: logs.LogRetention.ONE_WEEK,
    });

    // Add IAM execution role permissions
    this.role?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['arn:aws:logs:*:*:*'],
      })
    );
  }
}