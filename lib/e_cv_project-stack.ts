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
    alertTopic.addSubscription(
      new subs.EmailSubscription("nayzinminlwin22@gmail.com")
    );

    // Creating a lambda function
    const fn = new lambda.Function(this, "FetcherFunction", {
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
    alertTopic.grantPublish(fn);

    // granting lambda function to put data into bucket
    bucket.grantPut(fn);

    // schedule the lambda function to run every 5 minutes
    new events.Rule(this, "FiveMinuteRule", {
      description: "5min rule to trigger the lambda function",
      // schedule: events.Schedule.rate(cdk.Duration.days(1)),
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new targets.LambdaFunction(fn)],
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

    // i8.1: Deploy static website files to the S3 bucket
    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: [s3deploy.Source.asset("../ECV_PROJECT/site")], // Path to your static website files
      destinationBucket: siteBucket,
      destinationKeyPrefix: "/", // Optional: specify a prefix for the files in the bucket
      retainOnDelete: false, // Do not retain files when the stack is deleted
    });

    // i8.2: Define DynamoDB table for User Alert Configs
    const alertConfigsTable = new dynamoDB.Table(this, "AlertConfigs", {
      tableName: "UserAlertConfigs", // Optional: specify a table name

      partitionKey: {
        name: "userId",
        type: dynamoDB.AttributeType.STRING,
      },
      sortKey: {
        name: "alertID",
        type: dynamoDB.AttributeType.STRING,
      },
      billingMode: dynamoDB.BillingMode.PROVISIONED, // Use provisioned billing mode
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Remove the table when the stack is destroyed
    });
  }
}
