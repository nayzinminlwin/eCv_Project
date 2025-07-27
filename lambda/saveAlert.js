// i8.3 : Save Alert API and Lambda Function
// Lambda function handling POST /alerts

const AWS = require("aws-sdk");
const db = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();
const { fetch_and_write_to_s3 } = require("./fetch_n_write_s3"); // Importing from fetch_n_write_s3.js

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
    const { userID, email, symbol, condition, upperBound, lowerBound } =
      JSON.parse(event.body || "{}");

    // 1. validate input
    if (
      !userID ||
      userID.trim() === "" ||
      !email ||
      !symbol ||
      !condition ||
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
          price: upperBound,
          lowerBound,
          createdAt: new Date().toISOString(),
        },
      })
      .promise();

    // SNS mail subscription
    const subs = await sns
      .listSubscriptionsByTopic({
        TopicArn: process.env.USER_ALERT_TOPIC_ARN, // injected by CDK
      })
      .promise();

    let rtnMsg = "";
    // Check if email is already subscribed
    const emailExists = subs.Subscriptions.find(
      (sub) => sub.Endpoint === email && sub.Protocol === "email"
    );

    // If not subscribed, add the email to the SNS topic
    if (!emailExists) {
      await sns
        .subscribe({
          TopicArn: process.env.USER_ALERT_TOPIC_ARN, // injected by CDK
          Protocol: "email",
          Endpoint: email, // user's email
        })
        .promise();
      rtnMsg = `\nPlease confirm via your email inbox.`;
      console.log(
        `✅ Subscribed ${email} to alerts topic. Confirm via mail inbox.`
      );
    }

    // i8.7 : Prepare the most recent data and upload to S3
    // Make the initial fetch and save it to compare in the next fetch
    // Fetch and write data to S3
    await fetch_and_write_to_s3(symbol);

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
