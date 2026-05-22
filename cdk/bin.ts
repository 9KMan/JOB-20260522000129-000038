#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ServerlessBackendStack } from '../lib/stack';

const app = new cdk.App();
const env = app.node.tryGetContext('env') || 'dev';

new ServerlessBackendStack(app, `ServerlessBackend-${env}`, {
  env: {
    account: process.env.CDK_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_REGION || process.env.CDK_DEFAULT_REGION,
  },
  environment: env,
});