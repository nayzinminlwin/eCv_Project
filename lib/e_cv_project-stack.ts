import * as cdk from "aws-cdk-lib";
import { SqsDestination } from "aws-cdk-lib/aws-s3-notifications";
import { Bucket, BlockPublicAccess } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
// import * as sqs from "aws-cdk-lib/aws-sqs";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as dynamoDB from "aws-cdk-lib/aws-dynamodb";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  AwsCustomResource,
  PhysicalResourceId,
  AwsCustomResourcePolicy,
} from "aws-cdk-lib/custom-resources"; // custom resource for flexible SNS topic removal and recreation
import * as iam from "aws-cdk-lib/aws-iam";

export class ECvProjectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // initial example testing blocks
    {
      // // example resource
      // const queue = new sqs.Queue(this, "ECvProjectQueue", {
      //   visibilityTimeout: cdk.Duration.seconds(300),
      //   removalPolicy: cdk.RemovalPolicy.DESTROY, // Remove the queue when the stack is destroyed
      //   queueName: "ECvProjectQueue",
      // });
      //
      // // Creating a level1 bucket which i need to identify all by manual.
      // const level1S3Bucket = new CfnBucket(this, "MyFirstLevel1ConstructBucket", {
      //   versioningConfiguration: {
      //     status: "Enabled",
      //   },
      // });
      // // Set removal policy and auto-delete objects for the level1 bucket
      // level1S3Bucket.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
      // (level1S3Bucket as any).autoDeleteObjects = true; // Note: autoDeleteObjects is not a property of CfnBucketProps, but can be set like this if needed for experimentation
      //
      // // level2 bucket (the sweet spot) where everything necessary is auto.
      // const level2S3Bucket = new Bucket(this, "MyFirstLevel2ConstructBucket", {
      //   bucketName: "myfirstlevel2bucketirl",
      //   versioned: true,
      //   removalPolicy: cdk.RemovalPolicy.DESTROY, // to delete all inside the bucket after cdk destroy
      //   autoDeleteObjects: true, // Good practice for experiment data
      // });
      //
      // // Once the s3 object is created, add the event notification to queue
      // level2S3Bucket.addEventNotification(EventType.OBJECT_CREATED,new SqsDestination(myQueue));
      // // Creating a sqsQueue
      // const myQueue = new Queue(this, "MyQueue", {
      //   queueName: "MyQueue",
      //   removalPolicy: cdk.RemovalPolicy.DESTROY, // Remove the queue when the stack is destroyed
      // });
    }

    const bucket = new Bucket(this, "ReportBucket", {
      bucketName: "report-bucket-for-real",

      // to delete all inside the bucket after cdk destroy
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      // Good practice for experiment data
    });

    // old way to create SNS topic
    {
      // // i7: Create SNS topic for error alerts
      // const errorAlertTopic = new sns.Topic(this, "ErrorAlertTopic", {
      //   topicName: "ErrorAlertTopic",
      //   displayName: "Pipeline Error Alerts",
      // });
      // // i7: Subscribe an email address to the SNS topic
      // const errorAlertSub = errorAlertTopic.addSubscription(
      //   new subs.EmailSubscription("nayzinminlwin22@gmail.com")
      // );
      // // Retain the subscription when the stack is deleted
      // errorAlertSub.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
      // // Remove the topic when the stack is destroyed
      // (errorAlertTopic.node.defaultChild as sns.CfnTopic).applyRemovalPolicy(
      //   cdk.RemovalPolicy.RETAIN
      // );
    }

    // Edit: Flexible SNS topic removal and recreation
    const eAlertTopic = "Error-Alert-Topic";

    // Ensure the SNS topic exists, creating it if it doesn't
    const ensureTopic = new AwsCustomResource(this, "EnsureTopic", {
      onCreate: {
        service: "SNS",
        action: "createTopic",
        parameters: {
          Name: eAlertTopic,
          displayName: "Pipeline Error Alerts",
        },
        // SNS topic ARN will be used as the physical resource ID
        physicalResourceId: PhysicalResourceId.fromResponse("TopicArn"),
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    // Get the topic ARN from the custom resource
    const errorTopicArn = ensureTopic.getResponseField("TopicArn");
    const errorAlertTopic = sns.Topic.fromTopicArn(
      this,
      "Error-Alert-Topic",
      errorTopicArn
    );

    // Subscribe an email address to the SNS topic
    const myMailSub = errorAlertTopic.addSubscription(
      new subs.EmailSubscription("nayzinminlwin22@gmail.com")
    );
    myMailSub.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    // old way to create Lambda function
    {
      // // Creating a lambda function
      // const fetcherFn0 = new lambda.Function(this, "FetcherFunction", {
      //   runtime: lambda.Runtime.NODEJS_18_X, // use nodeJS 18x runtime
      //   handler: "index.handler", // point to export.handler in index.js
      //   code: lambda.Code.fromAsset("lambda"), // package up everything in ./lambda/
      //   environment: {
      //     // pass the bucket name into the function as an environment variable
      //     BUCKET_NAME: bucket.bucketName,
      //     // pass the SNS topic ARN into the function as an environment variable
      //     ERROR_ALERT_TOPIC_ARN: errorAlertTopic.topicArn,
      //   },
      //   timeout: cdk.Duration.seconds(20), // set timeout to 20 seconds
      // });
    }

    // New way to create Lambda function using NodejsFunction
    // This is more efficient for bundling and transpiling TypeScript code
    const fetcherFn = new NodejsFunction(this, "FetcherFunction", {
      runtime: lambda.Runtime.NODEJS_18_X, // use nodeJS 18x runtime
      entry: "lambda/index.js", // point to export.handler in index.js
      handler: "handler", // point to export.handler in index.js
      bundling: {
        // externalModules: ["aws-sdk"], // Exclude aws-sdk from the bundle
      },
      environment: {
        BUCKET_NAME: bucket.bucketName,
        ERROR_ALERT_TOPIC_ARN: errorAlertTopic.topicArn,
      },
    });

    // i7: grant publish permissions to the lambda function
    errorAlertTopic.grantPublish(fetcherFn);

    // granting lambda function to put data into bucket
    bucket.grantPut(fetcherFn);
    // granting lambda function to read data from bucket
    bucket.grantRead(fetcherFn);

    // schedule the lambda function to run every 5 minutes
    new events.Rule(this, "FiveMinuteRule", {
      description: "5min rule to trigger the lambda function",
      // schedule: events.Schedule.rate(cdk.Duration.days(1)),
      schedule: events.Schedule.rate(cdk.Duration.minutes(30)),
      targets: [new targets.LambdaFunction(fetcherFn)],
    });

    // i8.1: S3 bucket for static website hosting
    const siteBucket = new Bucket(this, "SiteBucket", {
      bucketName: "nzml-my-static-website-bucket",
      websiteIndexDocument: "index.html",
      blockPublicAccess: new BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }), // Allow public access
      publicReadAccess: true, // Allow public read access for static website
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Remove the bucket when the stack is destroyed
      autoDeleteObjects: true,
    });

    // old way to create DynamoDB table

    // // i8.2: Define DynamoDB table for User Alert Configs
    // const alertConfigsTable = new dynamoDB.Table(this, "AlertConfigs", {
    //   tableName: "UserAlertConfigs", // Optional: specify a table name
    //   partitionKey: {
    //     name: "userID",
    //     type: dynamoDB.AttributeType.STRING,
    //   },
    //   sortKey: {
    //     name: "alertID",
    //     type: dynamoDB.AttributeType.STRING,
    //   },
    //   billingMode: dynamoDB.BillingMode.PAY_PER_REQUEST, // Use on-demand billing mode
    //   removalPolicy: cdk.RemovalPolicy.DESTROY, // Remove the table when the stack is destroyed
    // });

    // new way to create DynamoDB with aws custom resource
    const dynamoDBTable_name = "UserAlertConfigs";

    const ensureAlertConfigsTable = new AwsCustomResource(
      this,
      "EnsureAlertConfigsTable",
      {
        onCreate: {
          service: "DynamoDB",
          action: "createTable",
          parameters: {
            TableName: dynamoDBTable_name,
            AttributeDefinitions: [
              {
                AttributeName: "userID",
                AttributeType: "S",
              },
              {
                AttributeName: "alertID",
                AttributeType: "S",
              },
            ],
            KeySchema: [
              {
                AttributeName: "userID",
                KeyType: "HASH",
              },
              {
                AttributeName: "alertID",
                KeyType: "RANGE",
              },
            ],
            BillingMode: "PAY_PER_REQUEST", // Use on-demand billing mode
          },
          // DynamoDB arn will be used as the physical resource ID
          physicalResourceId: PhysicalResourceId.of("TableArn"),
          ignoreErrorCodesMatching: "ResourceInUseException", // Ignore if the table already exists
        },
        onUpdate: {
          service: "DynamoDB",
          action: "describeTable",
          parameters: {
            TableName: dynamoDBTable_name,
          },
          physicalResourceId: PhysicalResourceId.of("TableArn"),
          ignoreErrorCodesMatching: "ResourceNotFoundException", // Ignore if the table does not exist
        },
        policy: AwsCustomResourcePolicy.fromSdkCalls({
          resources: AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      }
    );

    // Get the table arn from the custom resource
    // const alertConfigsTableArn =
    //   ensureAlertConfigsTable.getResponseField("TableArn");
    const alertConfigsTableArn = this.formatArn({
      service: "dynamodb",
      resource: "table",
      resourceName: dynamoDBTable_name,
      // arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
    });

    const alertConfigsTable = dynamoDB.Table.fromTableArn(
      this,
      "AlertConfigsTable",
      alertConfigsTableArn
    );

    // // i8.3 : Save Alert API and Lambda Function

    // old way to create Lambda function for saving alerts
    {
      // // new Lambda funtion to handle POST /alerts
      // const saveAlertFn0 = new lambda.Function(this, "SaveAlertFunction", {
      //   runtime: lambda.Runtime.NODEJS_18_X,
      //   handler: "saveAlert.handler", // point to export.handler in saveAlert.js
      //   code: lambda.Code.fromAsset("lambda"), // package up everything in ./lambda/
      //   environment: {
      //     TABLE_NAME: alertConfigsTable.tableName, // pass the table name into the function as an environment variable
      //     BUCKET_NAME: bucket.bucketName, // pass the bucket name into the function as an environment variable
      //   },
      //   timeout: cdk.Duration.seconds(10), // set timeout to 10 seconds
      // });
    }

    // New way to create Lambda function using NodejsFunction
    const saveAlertFn = new NodejsFunction(this, "SaveAlertFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: "lambda/saveAlert.js", // point to export.handler in saveAlert.js
      handler: "handler", // point to export.handler in saveAlert.js
      bundling: {
        // externalModules: ["aws-sdk"], // Exclude aws-sdk from the bundle
      },
      environment: {
        TABLE_NAME: alertConfigsTable.tableName, // pass the table name into the function as an environment variable
        BUCKET_NAME: bucket.bucketName, // pass the bucket name into the function as an environment variable
      },
      timeout: cdk.Duration.seconds(10), // set timeout to 10 seconds
    });

    // Grant the Lambda function permissions to write to the DynamoDB table
    alertConfigsTable.grantWriteData(saveAlertFn); // grant write permissions to the lambda function
    // alertConfigsTable.grantFullAccess(saveAlertFn); // grant full access to the lambda function

    // granting savealert lambda function to put data into bucket for initial fetch
    bucket.grantPut(saveAlertFn);

    // Create an HTTP API for saving alerts
    const api = new apigw.HttpApi(this, "AlertApi", {
      apiName: "UserAlertApi",
      createDefaultStage: true, // auto-deploy to "$default" stage
      corsPreflight: {
        allowOrigins: ["*"], // Allow all origins
        allowMethods: [
          apigw.CorsHttpMethod.POST,
          apigw.CorsHttpMethod.OPTIONS,
          apigw.CorsHttpMethod.DELETE,
        ], // Allow POST and OPTIONS and DELETE methods
        allowHeaders: ["Content-Type"], // Allow Content-Type header
      },
    });

    // Write POST /alerts -> lambda
    api.addRoutes({
      path: "/alerts",
      methods: [apigw.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        "SaveAlertIntegration",
        saveAlertFn
      ),
    });

    // i8.4 : Delete Alert API and Lambda Function
    // New way to create Lambda function using NodejsFunction
    const deleteAlertFn = new NodejsFunction(this, "DeleteAlertFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: "lambda/deleteAlert.js", // point to export.handler in deleteAlert.js
      handler: "handler", // point to export.handler in deleteAlert.js
      bundling: {
        // externalModules: ["aws-sdk"], // Exclude aws-sdk from the bundle
      },
      environment: {
        TABLE_NAME: alertConfigsTable.tableName, // pass the table name into the function as an environment variable
      },
      timeout: cdk.Duration.seconds(10), // set timeout to 10 seconds
    });

    // Grant the Lambda function permissions to delete from the DynamoDB table
    alertConfigsTable.grantWriteData(deleteAlertFn); // grant write permissions to the lambda function

    api.addRoutes({
      path: "/alerts/delete/{userID}/{alertID}", // Define the path with userID and alertID as path parameters
      methods: [apigw.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration(
        "DeleteAlertIntegration",
        deleteAlertFn
      ),
    });

    // Output the API endpoint URL
    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: api.url ?? "No URL available",
      description: "The endpoint URL of the User Alert API",
      exportName: "UserAlertApiEndpoint", // Optional: export the URL for use in other stacks
    });

    // i8.1: Deploy static website files to the S3 bucket
    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: [
        s3deploy.Source.asset("../ECV_PROJECT/site"),
        // i8.4 : Add a JSON file with the API URL
        s3deploy.Source.jsonData("config.json", {
          apiUrl: api.url! + "alerts", // Replace with your actual API URL
        }),
      ], // Path to your static website files
      destinationBucket: siteBucket,
      destinationKeyPrefix: "/", // Optional: specify a prefix for the files in the bucket
      retainOnDelete: false, // Do not retain files when the stack is deleted
    });

    // i8.5: Grant schedule Lambda DynamoDB read permissions
    const table: dynamoDB.ITable = alertConfigsTable;
    table.grantReadData(fetcherFn); // grant read permissions to the lambda function

    // // i8.5: SNS publish permissions to the lambda function
    // const userAlertTopic = new sns.Topic(this, "UserAlertTopic", {
    //   topicName: "UserAlertTopic",
    //   displayName: "User Alert Notifications",
    // });

    // i8.7: new way to create SNS topic
    const userAlertTopic_name = "User-Alert-Topic";

    // Ensure the SNS topic exists, creating it if it doesn't
    const ensureUserAlertTopic = new AwsCustomResource(
      this,
      "EnsureUserAlertTopic",
      {
        onCreate: {
          service: "SNS",
          action: "createTopic",
          parameters: {
            Name: userAlertTopic_name,
            displayName: "User Alert Notifications",
          },
          // SNS topic ARN will be used as the physical resource ID
          physicalResourceId: PhysicalResourceId.fromResponse("TopicArn"),
        },
        policy: AwsCustomResourcePolicy.fromSdkCalls({
          resources: AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      }
    );

    // Get the topic ARN from the custom resource
    const userAlertTopicArn = ensureUserAlertTopic.getResponseField("TopicArn");
    const userAlertTopic = sns.Topic.fromTopicArn(
      this,
      "UserAlertTopic",
      userAlertTopicArn
    );

    // pass the SNS topic ARN into the function as an environment variable
    fetcherFn.addEnvironment("USER_ALERT_TOPIC_ARN", userAlertTopic.topicArn);
    saveAlertFn.addEnvironment("USER_ALERT_TOPIC_ARN", userAlertTopic.topicArn);

    // grant publish permissions to the lambda function
    userAlertTopic.grantPublish(fetcherFn);

    // retain SNS mail subscriptions after stack deletion
    // userAlertTopic.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    // i8.6: Pass the table name into the function as an environment variable
    // pass the table name into the function as an environment variable
    fetcherFn.addEnvironment("TABLE_NAME", alertConfigsTable.tableName);

    // i8.7: User Alerts SNS topic subscription
    userAlertTopic.grantSubscribe(saveAlertFn);

    saveAlertFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["sns:ListSubscriptionsByTopic"],
        resources: [userAlertTopic.topicArn],
      })
    );
  }
}
