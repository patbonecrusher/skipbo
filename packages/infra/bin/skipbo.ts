import { App } from 'aws-cdk-lib';
import { SkipboStack } from '../lib/skipbo-stack.js';

const app = new App();
new SkipboStack(app, 'SkipboStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
