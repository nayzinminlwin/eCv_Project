import * as cdk from "aws-cdk-lib";
import { SqsDestination } from "aws-cdk-lib/aws-s3-notifications";
import { Bucket, BlockPublicAccess } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
// import * as sqs from "aws-cdk-lib/aws-sqs";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as dynamoDB from "aws-cdk-lib/aws-dynamodb";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";

export class ECvProjectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // initial example testing blocks
    const testingBlocks = {
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
    };

    const bucket = new Bucket(this, "ReportBucket", {
      bucketName: "report-bucket-for-real",

      // to delete all inside the bucket after cdk destroy
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      // Good practice for experiment data
    });

    // i7: Create SNS topic for error alerts
    const alertTopic = new sns.Topic(this, "ErrorAlertTopic", {
      topicName: "ErrorAlertTopic",
      displayName: "Pipeline Error Alerts",
    });

    // i7: Subscribe an email address to the SNS topic
    const alertSub = alertTopic.addSubscription(
      new subs.EmailSubscription("nayzinminlwin22@gmail.com")
    );
    // Retain the subscription when the stack is deleted
    alertSub.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    // Creating a lambda function
    const fetcherFn = new lambda.Function(this, "FetcherFunction", {
      runtime: lambda.Runtime.NODEJS_18_X, // use nodeJS 18x runtime
      handler: "index.handler", // point to export.handler in index.js
      code: lambda.Code.fromAsset("lambda"), // package up everything in ./lambda/
      environment: {
        // pass the bucket name into the function as an environment variable
        BUCKET_NAME: bucket.bucketName,
        ERROR_ALERT_TOPIC_ARN: alertTopic.topicArn, // pass the SNS topic ARN into the function as an environment variable
      },
      timeout: cdk.Duration.seconds(20), // set timeout to 20 seconds
    });

    // i7: grant publish permissions to the lambda function
    alertTopic.grantPublish(fetcherFn);

    // granting lambda function to put data into bucket
    bucket.grantPut(fetcherFn);

    // schedule the lambda function to run every 5 minutes
    new events.Rule(this, "FiveMinuteRule", {
      description: "5min rule to trigger the lambda function",
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      // schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
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

    // i8.2: Define DynamoDB table for User Alert Configs
    const alertConfigsTable = new dynamoDB.Table(this, "AlertConfigs", {
      tableName: "UserAlertConfigs", // Optional: specify a table name

      partitionKey: {
        name: "userID",
        type: dynamoDB.AttributeType.STRING,
      },

      sortKey: {
        name: "alertID",
        type: dynamoDB.AttributeType.STRING,
      },
      billingMode: dynamoDB.BillingMode.PAY_PER_REQUEST, // Use on-demand billing mode
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Remove the table when the stack is destroyed
    });

    // i8.3 : Save Alert API and Lambda Function
    // new Lambda funtion to handle POST /alerts
    const saveAlertFn = new lambda.Function(this, " SaveAlertFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "saveAlert.handler", // point to export.handler in saveAlert.js
      code: lambda.Code.fromAsset("lambda"), // package up everything in ./lambda/
      environment: {
        TABLE_NAME: alertConfigsTable.tableName, // pass the table name into the function as an environment variable
      },
      timeout: cdk.Duration.seconds(10), // set timeout to 10 seconds
    });

    // Grant the Lambda function permissions to write to the DynamoDB table
    alertConfigsTable.grantWriteData(saveAlertFn); // grant write permissions to the lambda function

    // Create an HTTP API
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
    // new Lambda function to handle DELETE /alerts
    const deleteAlertFn = new lambda.Function(this, "DeleteAlertFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "deleteAlert.handler", // point to export.handler in deleteAlert.js
      code: lambda.Code.fromAsset("lambda"), // package up everything in ./lambda/
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

    // i8.5: SNS publish permissions to the lambda function
    const userAlertTopic = new sns.Topic(this, "UserAlertTopic", {
      topicName: "UserAlertTopic",
      displayName: "User Alert Notifications",
    });

    // pass the SNS topic ARN into the function as an environment variable
    fetcherFn.addEnvironment("USER_ALERT_TOPIC_ARN", userAlertTopic.topicArn);

    // grant publish permissions to the lambda function
    userAlertTopic.grantPublish(fetcherFn);

    // retain SNS mail subscriptions after stack deletion
    userAlertTopic.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    // i8.6: Pass the table name into the function as an environment variable
    // pass the table name into the function as an environment variable
    fetcherFn.addEnvironment("TABLE_NAME", alertConfigsTable.tableName);
  }
}
