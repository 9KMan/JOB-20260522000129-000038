import { UserPool, UserPoolProps, CfnUserPoolDomain, UserPoolClient, CfnUserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Duration, Stack } from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface CognitoAuthProps {
  environment: string;
}

export class CognitoAuth {
  public readonly userPool: UserPool;
  public readonly userPoolId: string;
  public readonly appClientId: string;
  public readonly userPoolDomain: string;

  constructor(scope: Stack, id: string, props: CognitoAuthProps) {
    const { environment } = props;

    // Create User Pool with email-based sign-in
    this.userPool = new UserPool(scope, `${id}-user-pool`, {
      userPoolName: `serverless-backend-users-${environment}`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minimumLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      mfa: 'optional',
      mfaSecondFactor: {
        sms: true,
        otp: true,
      },
      userVerification: {
        emailStyle: 'code',
      },
      accountRecovery: {
        verifiedEmail: true,
      },
    });

    this.userPoolId = this.userPool.userPoolId;

    // Create User Pool Domain
    const userPoolDomain = new CfnUserPoolDomain(scope, `${id}-user-pool-domain`, {
      domain: `serverless-backend-${environment}`,
      userPoolId: this.userPoolId,
    });
    this.userPoolDomain = userPoolDomain.domain!;

    // Create App Client
    const appClient = new CfnUserPoolClient(scope, `${id}-app-client`, {
      userPoolId: this.userPoolId,
      clientName: `serverless-backend-app-${environment}`,
      generateSecret: false,
      authFlowTypes: ['USER_PASSWORD_AUTH', 'USER_SRP_AUTH', 'REFRESH_TOKEN_AUTH'],
      tokenValidityUnits: {
        accessToken: 'hours',
        idToken: 'hours',
        refreshToken: 'days',
      },
      accessTokenValidity: 1,
      idTokenValidity: 1,
      refreshTokenValidity: 30,
    });

    this.appClientId = appClient.ref;

    // Create IAM role for unauthenticated access (if needed)
    const unauthRole = new iam.Role(scope, `${id}-unauth-role`, {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      roleName: `serverless-backend-unauth-${environment}`,
      permissionsPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'cognito-idp:SignUp',
            'cognito-idp:ConfirmSignUp',
            'cognito-idp:ResendConfirmationCode',
          ],
          resources: [this.userPool.userPoolArn],
        }),
      ],
    });
  }
}