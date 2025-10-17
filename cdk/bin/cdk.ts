#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { AuthStack } from "../lib/cdk-stack";

const app = new App();

new AuthStack(app, "AuthStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
