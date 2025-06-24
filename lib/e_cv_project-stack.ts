import * as cdk from 'aws-cdk-lib';
import { SqsDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { Bucket, CfnBucket, EventType } from 'aws-cdk-lib/aws-s3';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class ECvProjectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'ECvProjectQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });

    // Creating a level1 bucket which i need to identify all by manual.
    // const level1S3Bucket = new CfnBucket(this,"MyFirstLevel1ConstructBucket",{
    //   versioningConfiguration : {
    //     status : "Enabled"
    //   }
    // });

    // // level2 bucket (the sweet spot) where everything necessary is auto. 
    // const level2S3Bucket = new Bucket(this,"MyFirstLevel2ConstructBucket",{
    //   bucketName : "myfirstlevel2bucketirl",
    //   versioned : true,
    // });

    const bucket = new Bucket(this, "ReportBucket", {

      bucketName : "report_bucket",

      // to delete all inside the bucket after cdk destroy
      removalPolicy : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects : true,
      // Good practice for experiment data

    })


    // Creating a sqsQueue
    const myQueue = new Queue(this,"MyQueue",{
      queueName : "MyQueue",
    });

    // Creating a lambda function
    const fn = new lambda.Function(this,"FetcherFunction",{
      runtime : lambda.Runtime.NODEJS_18_X, // use nodeJS 18x runtime
      handler : 'index.handler',            // point to export.handler in index.js
      code : lambda.Code.fromAsset('lambda'), // package up everything in ./lambda/
      environment : {
        // pass the bucket name into the function as an environment variable
        BUCKET_NAME : bucket.bucketName,
      },
    });

    // granting lambda function to put data into bucket
    bucket.grantPut(fn);

    

    // // Once the s3 object is created, add the event notification to queue
    // level2S3Bucket.addEventNotification(EventType.OBJECT_CREATED,new SqsDestination(myQueue));
  }
}
