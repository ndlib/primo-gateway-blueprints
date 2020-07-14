import { PolicyStatement, Role, RoleProps } from '@aws-cdk/aws-iam'
import { Bucket } from '@aws-cdk/aws-s3'
import cdk = require('@aws-cdk/core')
import { Fn } from '@aws-cdk/core'

export interface IPrimoGatewayBuildRoleProps extends RoleProps {
  readonly stages: string[]
  readonly artifactBucket: Bucket
}

export class PrimoGatewayBuildRole extends Role {
  constructor(scope: cdk.Construct, id: string, props: IPrimoGatewayBuildRoleProps) {
    super(scope, id, props)

    const serviceStackPrefix = scope.node.tryGetContext('serviceStackName') || 'primo-gateway'
    const serviceStacks = props.stages.map((stage) => `${serviceStackPrefix}-${stage}`)

    // Allow checking what policies are attached to this role
    this.addToPolicy(
      new PolicyStatement({
        resources: [this.roleArn],
        actions: ['iam:GetRolePolicy'],
      }),
    )
    // Allow modifying IAM roles related to our application
    this.addToPolicy(
      new PolicyStatement({
        resources: serviceStacks.map((stackName) => Fn.sub('arn:aws:iam::${AWS::AccountId}:role/' + stackName + '*')),
        actions: [
          'iam:GetRole',
          'iam:GetRolePolicy',
          'iam:CreateRole',
          'iam:DeleteRole',
          'iam:DeleteRolePolicy',
          'iam:AttachRolePolicy',
          'iam:DetachRolePolicy',
          'iam:PutRolePolicy',
          'iam:PassRole',
          'iam:TagRole',
        ],
      }),
    )

    // Global resource permissions for managing cloudfront and logs
    this.addToPolicy(
      new PolicyStatement({
        resources: ['*'],
        actions: [
          'cloudformation:ListExports',
          'cloudfront:GetDistribution',
          'cloudfront:CreateDistribution',
          'cloudfront:UpdateDistribution',
          'cloudfront:TagResource',
          'cloudfront:CreateInvalidation',
          'logs:CreateLogGroup',
        ],
      }),
    )

    // Allow logging for this stack
    this.addToPolicy(
      new PolicyStatement({
        resources: [
          Fn.sub('arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/codebuild/${AWS::StackName}-*'),
        ],
        actions: ['logs:CreateLogStream'],
      }),
    )
    this.addToPolicy(
      new PolicyStatement({
        resources: [
          Fn.sub(
            'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/codebuild/${AWS::StackName}-*:log-stream:*',
          ),
        ],
        actions: ['logs:PutLogEvents'],
      }),
    )

    // Allow storing artifacts in S3 buckets
    this.addToPolicy(
      new PolicyStatement({
        resources: [props.artifactBucket.bucketArn, 'arn:aws:s3:::cdktoolkit-stagingbucket-*'],
        actions: ['s3:ListBucket', 's3:ListBucketVersions', 's3:GetBucketLocation', 's3:GetBucketPolicy'],
      }),
    )
    this.addToPolicy(
      new PolicyStatement({
        resources: [props.artifactBucket.bucketArn + '/*', 'arn:aws:s3:::cdktoolkit-stagingbucket-*/*'],
        actions: ['s3:GetObject', 's3:PutObject'],
      }),
    )

    // Allow creating and managing lambda with this stack name
    this.addToPolicy(
      new PolicyStatement({
        resources: serviceStacks.map((stackName) =>
          Fn.sub('arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:' + stackName + '*'),
        ),
        actions: ['lambda:*'],
      }),
    )

    // Needed for setting up lambda VPC info
    this.addToPolicy(
      new PolicyStatement({
        resources: ['*'],
        actions: [
          'ec2:DescribeSecurityGroups',
          'ec2:DescribeSecurityGroupReferences',
          'ec2:DescribeSubnets',
          'ec2:DescribeVpcs',
          'ec2:DescribeVpcAttribute',
        ],
      }),
    )

    // Allow fetching details about and updating the application stack
    this.addToPolicy(
      new PolicyStatement({
        resources: serviceStacks.map((stackName) =>
          Fn.sub('arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/' + stackName + '/*'),
        ),
        actions: [
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackEvents',
          'cloudformation:DescribeChangeSet',
          'cloudformation:CreateChangeSet',
          'cloudformation:ExecuteChangeSet',
          'cloudformation:DeleteChangeSet',
          'cloudformation:DeleteStack',
          'cloudformation:GetTemplate',
        ],
      }),
    )

    // Allow reading some details about CDKToolkit stack so we can use the CDK CLI successfully from CodeBuild.
    this.addToPolicy(
      new PolicyStatement({
        resources: [Fn.sub('arn:aws:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/CDKToolkit/*')],
        actions: ['cloudformation:DescribeStacks'],
      }),
    )

    // Allow limited control of API Gateway so we can create a new api
    this.addToPolicy(
      new PolicyStatement({
        resources: [Fn.sub('arn:aws:apigateway:${AWS::Region}::/account')],
        actions: ['apigateway:PATCH'],
      }),
    )
    this.addToPolicy(
      new PolicyStatement({
        resources: [
          Fn.sub('arn:aws:apigateway:${AWS::Region}::/restapis'),
          Fn.sub('arn:aws:apigateway:${AWS::Region}::/domainnames'),
        ],
        actions: ['apigateway:POST'],
      }),
    )
    this.addToPolicy(
      new PolicyStatement({
        resources: [Fn.sub('arn:aws:apigateway:${AWS::Region}::/restapis/*')],
        actions: ['apigateway:*'],
      }),
    )

    // Allow fetching parameters from ssm
    this.addToPolicy(
      new PolicyStatement({
        resources: [
          Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/primo-gateway/*'),
          Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:*'),
        ],
        actions: ['ssm:GetParametersByPath', 'ssm:GetParameter', 'ssm:GetParameters'],
      }),
    )
  }
}

export default PrimoGatewayBuildRole
