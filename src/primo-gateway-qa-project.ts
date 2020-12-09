import { PipelineProject, BuildSpec, BuildEnvironmentVariableType, LinuxBuildImage } from '@aws-cdk/aws-codebuild'
import { Role } from '@aws-cdk/aws-iam'
import { Construct } from '@aws-cdk/core'

export interface IPrimoGatewayQaProjectProps {
  readonly stage: string
  readonly role: Role
}

export class PrimoGatewayQaProject extends PipelineProject {
  constructor(scope: Construct, id: string, props: IPrimoGatewayQaProjectProps) {
    const paramStorePath = `/all/primo-gateway/${props.stage}`
    const pipelineProps = {
      role: props.role,
      environment: {
        buildImage: LinuxBuildImage.STANDARD_4_0,
        environmentVariables: {
          API_URL: {
            value: `${paramStorePath}/api-url`,
            type: BuildEnvironmentVariableType.PARAMETER_STORE,
          },
          CI: { value: 'true', type: BuildEnvironmentVariableType.PLAINTEXT },
        },
      },
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '12.x',
            },
            commands: [
              'npm install -g newman',
              'echo "Ensure that the Newman spec is readable"',
              'chmod -R 755 ./tests/postman/*',
            ],
          },
          build: {
            commands: [
              'echo "Beginning tests at `date`"',
              `newman run ./tests/postman/qa_collection.json --env-var primoGatewayApiUrl=$API_URL`,
            ],
          },
        },
      }),
    }
    super(scope, id, pipelineProps)
  }
}

export default PrimoGatewayQaProject
