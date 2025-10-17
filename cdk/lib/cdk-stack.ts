import {
  Stack,
  StackProps,
  Duration,
  RemovalPolicy,
  CfnOutput,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { Table, AttributeType, BillingMode } from "aws-cdk-lib/aws-dynamodb";
import {
  HttpApi,
  HttpMethod,
  CorsHttpMethod,
  HttpApiProps,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Runtime, Function as Fn, Code } from "aws-cdk-lib/aws-lambda";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";

import { Runtime as PyRuntime } from "aws-cdk-lib/aws-lambda";
import { join } from "path";
import { LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks"; // not needed if simple invoke
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

export class AuthStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new Table(this, "UsersTable", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const jwtSecret = new Secret(this, "JwtSecret", {
      description: "JWT signing secret",
    });

    const passwordCheckFn = new Fn(this, "PasswordCheckFn", {
      runtime: PyRuntime.PYTHON_3_12,
      handler: "password_check_lambda.handler",
      code: Code.fromAsset("../src/python"),
      memorySize: 128,
      timeout: Duration.seconds(5),
      description: "Checks password strength during registration",
    });

    const fn = new Fn(this, "AuthFn", {
      runtime: Runtime.NODEJS_20_X,
      handler: "auth.handler",
      code: Code.fromAsset("../dist"),
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        TABLE_NAME: table.tableName,
        JWT_SECRET_ARN: jwtSecret.secretArn,
        ACCESS_TTL_SEC: "900",
        REFRESH_TTL_SEC: "604800",
        PASSWORD_CHECK_LAMBDA_ARN: passwordCheckFn.functionArn,
      },
    });

    table.grantReadWriteData(fn);
    passwordCheckFn.grantInvoke(fn);

    jwtSecret.grantRead(fn);

    const api = new HttpApi(this, "AuthApi", {
      corsPreflight: {
        allowCredentials: false,
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ["*"], // In production, restrict this to your domains
        maxAge: Duration.days(1),
      },
    });

    api.addRoutes({
      path: "/register",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("RegisterIntegration", fn),
    });

    api.addRoutes({
      path: "/login",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("LoginIntegration", fn),
    });
    api.addRoutes({
      path: "/token/refresh",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("RefreshIntegration", fn),
    });

    // Output the API endpoint for easy testing
    new CfnOutput(this, "ApiEndpoint", {
      value: api.url!,
      description: "Auth API Gateway endpoint URL",
    });

    new CfnOutput(this, "TableName", {
      value: table.tableName,
      description: "DynamoDB table name",
    });
  }
}
