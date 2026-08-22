import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import {
  WebSocketApi,
  WebSocketStage,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Distribution, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone, ARecord, AaaaRecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import type { Construct } from 'constructs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SkipboStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const gamesTable = new Table(this, 'GamesTable', {
      partitionKey: { name: 'gameId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const connectionsTable = new Table(this, 'ConnectionsTable', {
      partitionKey: { name: 'connectionId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const wsHandler = new NodejsFunction(this, 'WsHandler', {
      entry: path.join(__dirname, '../lambda/ws-handler.ts'),
      runtime: Runtime.NODEJS_20_X,
      memorySize: 256,
      // Bot turns are played out and broadcast one move at a time inside a single invocation
      // (see runBotTurns); 28s stays under API Gateway's WebSocket integration timeout ceiling.
      timeout: Duration.seconds(28),
      environment: {
        GAMES_TABLE: gamesTable.tableName,
        CONNECTIONS_TABLE: connectionsTable.tableName,
      },
      bundling: {
        format: OutputFormat.ESM,
        mainFields: ['module', 'main'],
        banner: "import { createRequire as topLevelCreateRequire } from 'module'; const require = topLevelCreateRequire(import.meta.url);",
      },
    });

    gamesTable.grantReadWriteData(wsHandler);
    connectionsTable.grantReadWriteData(wsHandler);

    const webSocketApi = new WebSocketApi(this, 'SkipboWebSocketApi', {
      connectRouteOptions: { integration: new WebSocketLambdaIntegration('ConnectIntegration', wsHandler) },
      disconnectRouteOptions: { integration: new WebSocketLambdaIntegration('DisconnectIntegration', wsHandler) },
      defaultRouteOptions: { integration: new WebSocketLambdaIntegration('DefaultIntegration', wsHandler) },
    });

    const stage = new WebSocketStage(this, 'ProdStage', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    const managementEndpoint = `https://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${stage.stageName}`;
    wsHandler.addEnvironment('WS_MANAGEMENT_ENDPOINT', managementEndpoint);
    webSocketApi.grantManageConnections(wsHandler);

    const siteBucket = new Bucket(this, 'SiteBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const domainName = 'skipbo.patlaplante.com';
    const hostedZone = HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: 'Z2CPV6KLV2FQA0',
      zoneName: 'patlaplante.com',
    });

    const certificate = new Certificate(this, 'SiteCertificate', {
      domainName,
      validation: CertificateValidation.fromDns(hostedZone),
    });

    const distribution = new Distribution(this, 'SiteDistribution', {
      defaultRootObject: 'index.html',
      domainNames: [domainName],
      certificate,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
    });

    new ARecord(this, 'SiteAliasRecordV4', {
      zone: hostedZone,
      recordName: 'skipbo',
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });

    new AaaaRecord(this, 'SiteAliasRecordV6', {
      zone: hostedZone,
      recordName: 'skipbo',
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });

    new BucketDeployment(this, 'SiteDeployment', {
      sources: [
        Source.asset(path.join(__dirname, '../../frontend/dist')),
        Source.jsonData('config.json', { wsUrl: stage.url }),
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new CfnOutput(this, 'SiteUrl', { value: `https://${domainName}` });
    new CfnOutput(this, 'CloudFrontDefaultUrl', { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, 'WebSocketUrl', { value: stage.url });
  }
}
