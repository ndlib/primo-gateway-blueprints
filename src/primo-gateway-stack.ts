import * as cdk from '@aws-cdk/core'
import { Fn } from '@aws-cdk/core'
import apigateway = require('@aws-cdk/aws-apigateway')
import lambda = require('@aws-cdk/aws-lambda')
import { RetentionDays } from '@aws-cdk/aws-logs'
import { StringParameter } from '@aws-cdk/aws-ssm'
import { Vpc, SecurityGroup } from '@aws-cdk/aws-ec2'
import { HierarchicalRestApiResources } from './hierarchical-rest-api-resources'

export interface IPrimoGatewayStackProps extends cdk.StackProps {
  readonly stage: string
  readonly lambdaCodePath: string
  readonly sentryProject: string
  readonly sentryVersion: string
  readonly networkStackName: string
}

export default class PrimoGatewayStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: IPrimoGatewayStackProps) {
    super(scope, id, props)

    // LAMBDAS
    const paramStorePath = `/all/primo-gateway/${props.stage}`
    const env = {
      SENTRY_DSN: StringParameter.valueForStringParameter(this, `${paramStorePath}/sentry_dsn`),
      SENTRY_ENVIRONMENT: props.stage,
      SENTRY_RELEASE: `${props.sentryProject}@${props.sentryVersion}`,
      PRIMO_URL: StringParameter.valueForStringParameter(this, `${paramStorePath}/primo_url`),
    }
    // VPC needed to access certain APIs.
    const vpcId = Fn.importValue(`${props.networkStackName}:VPCID`)
    const lambdaVpc = Vpc.fromVpcAttributes(this, 'LambdaVpc', {
      vpcId,
      availabilityZones: [Fn.select(0, Fn.getAzs()), Fn.select(1, Fn.getAzs())],
      publicSubnetIds: [
        Fn.importValue(`${props.networkStackName}:PublicSubnet1ID`),
        Fn.importValue(`${props.networkStackName}:PublicSubnet2ID`),
      ],
      privateSubnetIds: [
        Fn.importValue(`${props.networkStackName}:PrivateSubnet1ID`),
        Fn.importValue(`${props.networkStackName}:PrivateSubnet2ID`),
      ],
    })
    const securityGroupId = StringParameter.valueForStringParameter(this, `${paramStorePath}/securitygroupid`)
    const securityGroup = SecurityGroup.fromSecurityGroupId(this, 'LambdaSecurityGroup', securityGroupId)

    const queryLambda = new lambda.Function(this, 'QueryFunction', {
      functionName: `${props.stackName}-query`,
      description: 'Query primo for documents by id.',
      code: lambda.Code.fromAsset(props.lambdaCodePath),
      handler: 'query.handler',
      runtime: lambda.Runtime.NODEJS_12_X,
      logRetention: RetentionDays.ONE_WEEK,
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      environment: env,
      vpc: lambdaVpc,
      vpcSubnets: {
        subnets: lambdaVpc.privateSubnets,
      },
      securityGroups: [securityGroup],
    })

    const favoritesLambda = new lambda.Function(this, 'FavoritesFunction', {
      functionName: `${props.stackName}-favorites`,
      description: 'Fetch eshelf favorites for a user from primo.',
      code: lambda.Code.fromAsset(props.lambdaCodePath),
      handler: 'favorites.handler',
      runtime: lambda.Runtime.NODEJS_12_X,
      logRetention: RetentionDays.ONE_WEEK,
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      environment: env,
      vpc: lambdaVpc,
      vpcSubnets: {
        subnets: lambdaVpc.privateSubnets,
      },
      securityGroups: [securityGroup],
    })

    // API GATEWAY
    const api = new apigateway.RestApi(this, 'ApiGateway', {
      restApiName: props.stackName,
      description: 'Primo Gateway API',
      endpointExportName: `${props.stackName}-api-url`,
      deployOptions: {
        stageName: props.stage,
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: ['*'],
        allowCredentials: false,
        statusCode: 200,
      },
    })
    api.addRequestValidator('RequestValidator', {
      validateRequestParameters: true,
    })

    const defaultMethodOptions = {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: new apigateway.TokenAuthorizer(this, 'JwtAuthorizer', {
        handler: lambda.Function.fromFunctionArn(
          this,
          'AuthorizerFunction',
          `arn:aws:lambda:${this.region}:${this.account}:function:lambda-auth-${props.stage}`,
        ),
        identitySource: 'method.request.header.Authorization',
        authorizerName: 'jwt',
        resultsCacheTtl: cdk.Duration.minutes(5),
      }),
      requestParameters: {
        'method.request.header.Authorization': true,
      },
    }

    new HierarchicalRestApiResources({
      api: api,
      resources: [
        {
          pathPart: 'query',
          options: {
            defaultMethodOptions: defaultMethodOptions,
          },
          methods: [
            {
              httpMethod: 'GET',
              integration: new apigateway.LambdaIntegration(queryLambda),
            },
          ],
        },
        {
          pathPart: 'favorites',
          options: {
            defaultMethodOptions: defaultMethodOptions,
          },
          methods: [
            {
              httpMethod: 'GET',
              integration: new apigateway.LambdaIntegration(favoritesLambda),
            },
          ],
        },
      ],
    })
  }
}
