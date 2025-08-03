// i8.3 : Save Alert API and Lambda Function
// Lambda function handling POST /alerts

const AWS = require("aws-sdk");
const db = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();
const { fetch_AssetsData, writePrice_to_DynamoDB } = require("./fetch_n_write"); // Importing from fetch_n_write.js

exports.handler = async (event) => {
  try {
    // // i8.1 : Log incoming event
    // console.log(
    //   "😴 Received event:",
    //   JSON.stringify({
    //     isBase64: event.isBase64Encoded,
    //     headers: event.headers,
    //     body: event.body,
    //   })
    // );

    // 0. parse JSON body
    const { userID, email, symbol, condition, price, upperBound, lowerBound } =
      JSON.parse(event.body || "{}");

    // 1. validate input
    if (
      !userID ||
      userID.trim() === "" ||
      !email ||
      !symbol ||
      !condition ||
      price === null ||
      price === undefined ||
      upperBound === null ||
      upperBound === undefined ||
      lowerBound === null ||
      lowerBound === undefined
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Missing required fields: userID, email, symbol, condition, price, lowerBound",
          message: "Please provide all required fields.",
        }),
      };
    }

    // 2. Generate unique alert ID
    const alertID = `USER${userID}`;

    // 3. Write to DynamoDB
    await db
      .put({
        TableName: process.env.TABLE_NAME, // injected by CDK
        Item: {
          userID,
          email,
          alertID,
          symbol,
          condition,
          price,
          upperBound,
          lowerBound,
          createdAt: new Date().toISOString(),
        },
      })
      .promise();

    const emailUserName = email.split("@")[0]; // Extract username from email

    // check if usermail already got a sns topic
    const existingTopics = await sns.listTopics().promise();
    const userTopicExists = existingTopics.Topics.some((topic) =>
      topic.TopicArn.includes(`user-alerts-${emailUserName}`)
    );

    let rtnMsg = "";

    if (!userTopicExists) {
      // Create a new SNS topic for the user if it doesn't exist
      const userAlertTopicArn = `arn:aws:sns:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:user-alerts-${emailUserName}`;
      await sns.createTopic({ Name: `user-alerts-${emailUserName}` }).promise();

      // Subscribe the user's email to the topic
      await sns
        .subscribe({
          TopicArn: userAlertTopicArn,
          Protocol: "email",
          Endpoint: email,
        })
        .promise();

      rtnMsg = `\nPlease confirm via your email inbox.`;

      console.log(`✅ New Topic saved for userID: ${userID}!`);
    }

    // // SNS mail subscription
    // {
    //   // const subs = await sns
    //   //   .listSubscriptionsByTopic({
    //   //     TopicArn: process.env.USER_ALERT_TOPIC_ARN, // injected by CDK
    //   //   })
    //   //   .promise();
    //   // let rtnMsg = "";
    //   // // Check if email is already subscribed
    //   // const emailExists = subs.Subscriptions.find(
    //   //   (sub) => sub.Endpoint === email && sub.Protocol === "email"
    //   // );
    //   // // If not subscribed, add the email to the SNS topic
    //   // if (!emailExists) {
    //   //   await sns
    //   //     .subscribe({
    //   //       TopicArn: process.env.USER_ALERT_TOPIC_ARN, // injected by CDK
    //   //       Protocol: "email",
    //   //       Endpoint: email, // user's email
    //   //     })
    //   //     .promise();
    //   //   rtnMsg = `\nPlease confirm via your email inbox.`;
    //   //   console.log(
    //   //     `✅ Subscribed ${email} to alerts topic. Confirm via mail inbox.`
    //   //   );
    //   // }
    // }

    // s3 fetch and write architecture changed to i12 Dynamo fetch and write

    // i12: Fetch the assets data and write to DynamoDB
    // Collect unique symbols to fetch data in burst
    const symbols = new Set([symbol]); // Collect unique symbols
    const assetsData = await fetch_AssetsData(symbols); // Fetch assets data
    writePrice_to_DynamoDB(assetsData); // Write fetched data to DynamoDB

    // 4. Return success response
    return {
      statusCode: 201,
      body: JSON.stringify({
        message: rtnMsg,
        userID,
        alertID,
      }),
    };
  } catch (error) {
    console.error("❌ Error saving alert:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "❌ Failed to save alert",
        message: error.message,
      }),
    };
  }
};
