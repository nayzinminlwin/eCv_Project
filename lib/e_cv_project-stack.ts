import * as cdk from 'aws-cdk-lib';
import { SqsDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { Bucket, CfnBucket, EventType } from 'aws-cdk-lib/aws-s3';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class ECvProjectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'ECvProjectQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });

    const level1S3Bucket = new CfnBucket(this,"MyFirstLevel1ConstructBucket",{
      versioningConfiguration : {
        status : "Enabled"
      }
    });

    const level2S3Bucket = new Bucket(this,"MyFirstLevel2ConstructBucket",{
      bucketName : "myfirstlevel2bucketirl",
      versioned : true
    });

    const myQueue = new Queue(this,"MyQueue",{
      queueName : "MyQueue",
    });

    level2S3Bucket.addEventNotification(EventType.OBJECT_CREATED,new SqsDestination(myQueue));
  }
}
