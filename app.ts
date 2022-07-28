import { IResource, LambdaIntegration, MockIntegration, PassthroughBehavior, RestApi } from "aws-cdk-lib/aws-apigateway"
import { App, Stack, RemovalPolicy } from "aws-cdk-lib"
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb"
import { NodejsFunction, NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs"
import { Runtime } from "aws-cdk-lib/aws-lambda"
import { join } from "path"

export class ApiLambdaDynamoDbStack extends Stack {
  constructor(app: App, id: string) {
    super(app, id)

    const dynamoTable = new Table(this, "requests", {
      partitionKey: {
        name: "requestId",
        type: AttributeType.STRING,
      },
      tableName: "requests",
      removalPolicy: RemovalPolicy.DESTROY,
    })

    const nodeJsFunctionProps: NodejsFunctionProps = {
      bundling: {
        externalModules: ["aws-sdk"],
      },

      depsLockFilePath: join(__dirname, "lambdas", "package-lock.json"),
      environment: {
        PRIMARY_KEY: "requestId",
        TABLE_NAME: dynamoTable.tableName,
      },
      runtime: Runtime.NODEJS_14_X,
    }

    // Create Lambda Functions
    const getAllLambda = new NodejsFunction(this, "getAllRequestsFunction", {
      entry: join(__dirname, "lambdas", "get-all.ts"),
      ...nodeJsFunctionProps,
    })
    const createOneLambda = new NodejsFunction(this, "createRequestFunction", {
      entry: join(__dirname, "lambdas", "create.ts"),
      ...nodeJsFunctionProps,
    })
    const deleteOneLambda = new NodejsFunction(this, "deleteRequestFunction", {
      entry: join(__dirname, "lambdas", "delete-one.ts"),
      ...nodeJsFunctionProps,
    })

    // Grant the Lambda function read access to the DynamoDB table
    dynamoTable.grantReadWriteData(getAllLambda)
    dynamoTable.grantReadWriteData(createOneLambda)
    dynamoTable.grantReadWriteData(deleteOneLambda)

    // Integrate the Lambda functions with the API Gateway resource
    const getAllIntegration = new LambdaIntegration(getAllLambda)
    const createOneIntegration = new LambdaIntegration(createOneLambda)
    const deleteOneIntegration = new LambdaIntegration(deleteOneLambda)

    const api = new RestApi(this, "requestsApi", {
      restApiName: "Request Service",
    })

    const items = api.root.addResource("requests")
    items.addMethod("GET", getAllIntegration)
    items.addMethod("POST", createOneIntegration)
    addCorsOptions(items)

    const singleItem = items.addResource("{id}")
    singleItem.addMethod("DELETE", deleteOneIntegration)
    addCorsOptions(singleItem)
  }
}

export function addCorsOptions(apiResource: IResource) {
  apiResource.addMethod(
    "OPTIONS",
    new MockIntegration({
      integrationResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Headers":
              "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
            "method.response.header.Access-Control-Allow-Origin": "'*'",
            "method.response.header.Access-Control-Allow-Credentials": "'false'",
            "method.response.header.Access-Control-Allow-Methods": "'OPTIONS,GET,PUT,POST,DELETE'",
          },
        },
      ],
      passthroughBehavior: PassthroughBehavior.NEVER,
      requestTemplates: {
        "application/json": '{"statusCode": 200}',
      },
    }),
    {
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Headers": true,
            "method.response.header.Access-Control-Allow-Methods": true,
            "method.response.header.Access-Control-Allow-Credentials": true,
            "method.response.header.Access-Control-Allow-Origin": true,
          },
        },
      ],
    },
  )
}

const app = new App()
new ApiLambdaDynamoDbStack(app, "ApiLambdaCrudDynamoDBExample")
app.synth()
