import { HttpApi, HttpMethod, CorsHttpFlag } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthenticator } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Duration, Stack, Environment } from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface ApiGatewayProps {
  environment: string;
  userPoolArn: string;
  stages?: string[];
}

export class ApiGateway {
  public readonly httpApi: HttpApi;
  public readonly apiEndpoint: string;

  constructor(scope: Stack, id: string, props: ApiGatewayProps) {
    const { environment, userPoolArn } = props;
    const stages = props.stages || ['dev', 'staging', 'prod'];

    // Create HTTP API
    this.httpApi = new HttpApi(scope, `${id}-http-api`, {
      apiName: `serverless-backend-${environment}`,
      corsPreflight: {
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: [
          HttpMethod.GET,
          HttpMethod.POST,
          HttpMethod.PUT,
          HttpMethod.DELETE,
          HttpMethod.OPTIONS,
        ],
        allowOrigins: ['*'],
        maxAge: Duration.days(1),
      },
      defaultStage: stages[0],
    });

    // Add JWT authorizer
    const jwtAuth = new HttpJwtAuthenticator(scope, `${id}-jwt-auth`, {
      authorizerName: `cognito-authorizer-${environment}`,
      jwtIssuer: `https://cognito-idp.us-east-1.amazonaws.com/${userPoolArn.split('/')[userPoolArn.split('/').length - 1]}`,
      jwtAudience: [scope.node.tryGetContext('cognitoAppClientId') || 'unknown'],
    });

    this.httpApi.addAuthenticator({
      authorizer: jwtAuth,
      type: 'JWT',
    });

    // Add rate limiting
    this.httpApi.defaultStage?.node.defaultChild?.addPropertyOverride(
      'ThrottlingRatePerSecond',
      100
    );
    this.httpApi.defaultStage?.node.defaultChild?.addPropertyOverride(
      'BurstLimit',
      200
    );

    this.apiEndpoint = this.httpApi.url!;
  }

  public addRoute(scope: Stack, path: string, method: HttpMethod, lambdaArn: string, authorizer?: boolean) {
    const integration = new HttpLambdaIntegration(
      `${path.replace(/[^a-zA-Z]/g, '-')}-integration`,
      lambdaArn
    );

    this.httpApi.addRoutes({
      path,
      methods: [method],
      integration,
    });
  }
}