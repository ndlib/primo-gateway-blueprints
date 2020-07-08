import apigateway = require('@aws-cdk/aws-apigateway')

export interface IHierarchicalRestApiResourcesProps {
  readonly api: apigateway.RestApi
  readonly resources?: IHierarchicalResourceProps[]
  readonly rootMethods?: IHierarchicalMethodProps[]
}

export interface IHierarchicalResourceProps {
  readonly pathPart: string
  readonly options?: apigateway.ResourceOptions
  readonly methods?: IHierarchicalMethodProps[]
  readonly children?: IHierarchicalResourceProps[]
}

export interface IHierarchicalMethodProps {
  readonly httpMethod: string
  readonly integration?: apigateway.Integration
  readonly options?: apigateway.MethodOptions
}

export class HierarchicalRestApiResources {
  public readonly api: apigateway.RestApi
  public readonly rootResource: apigateway.IResource
  private _resources: apigateway.IResource[]
  public get resources(): apigateway.IResource[] {
    return this._resources
  }

  constructor(props: IHierarchicalRestApiResourcesProps) {
    this.api = props.api

    this.rootResource = props.api.root
    props.rootMethods?.forEach((methodProps) => {
      this.rootResource.addMethod(methodProps.httpMethod, methodProps.integration, methodProps.options)
    })

    this._resources = [
      this.rootResource,
      ...HierarchicalRestApiResources.addResourcesRecursive(this.rootResource, props.resources || []),
    ]
  }

  addResources(definitions: IHierarchicalResourceProps[]) {
    this._resources = [
      ...this.resources,
      ...HierarchicalRestApiResources.addResourcesRecursive(this.rootResource, definitions),
    ]
  }

  static addResourcesRecursive = (parent: apigateway.IResource, children: IHierarchicalResourceProps[]) => {
    let newResourceList: apigateway.Resource[] = []
    children.forEach((resourceDefinition) => {
      // Support multi-level paths like "some/endpoint/path". Only the final resource will have methods attached;
      // the higher levels will just be container resources in order to store the child resource
      const pathParts = resourceDefinition.pathPart.split('/').filter((part) => !!part)
      let nextParent = parent

      for (let i = 0; i < pathParts.length - 1; i++) {
        const emptyResource = nextParent.addResource(pathParts[i])
        newResourceList.push(emptyResource)
        nextParent = emptyResource
      }

      const newResource = nextParent.addResource(pathParts[pathParts.length - 1], resourceDefinition.options)
      newResourceList.push(newResource)

      resourceDefinition.methods?.forEach((methodDefinition) => {
        newResource.addMethod(methodDefinition.httpMethod, methodDefinition.integration, methodDefinition.options)
      })

      if (resourceDefinition.children) {
        newResourceList = newResourceList.concat(
          HierarchicalRestApiResources.addResourcesRecursive(newResource, resourceDefinition.children),
        )
      }
    })
    return newResourceList
  }
}
