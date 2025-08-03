// i8.4 : Delete Alert API and Lambda Function

const AWS = require("aws-sdk");
const db = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

exports.handler = async (event) => {
  try {
    // // i8.1 : Log incoming event
    // console.log(
    //   "😴 Received event:",
    //   JSON.stringify({
    //     isBase64: event.isBase64Encoded,
    //     headers: event.headers,
    //     // body: event.body,
    //   })
    // );

    // catching userID from delete url
    const userID = event.pathParameters?.userID;
    const alertID = event.pathParameters?.alertID;

    // 0. parse JSON body
    // const { userID } = JSON.parse(event.body || "{}");

    // 1. validate input
    if (!userID || userID.trim() === "" || !alertID || alertID.trim() === "") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields: userID or alertID",
          message: "Please provide both userID and alertID.",
        }),
      };
    }

    // check if alert exists
    const alertExists = await db
      .get({
        TableName: process.env.TABLE_NAME, // injected by CDK
        Key: {
          userID,
          alertID,
        },
      })
      .promise();

    // Log the alert existence check
    console.log("🤔 Alert existence check result:", alertExists);

    // return 404 if alert does not exist
    if (!alertExists.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: "Alert not found",
          message: `No alert found for userID: ${userID} and alertID: ${alertID}.`,
        }),
      };
    }

    // 2. Delete from DynamoDB
    await db
      .delete({
        TableName: process.env.TABLE_NAME, // injected by CDK
        Key: {
          userID,
          alertID,
        },
      })
      .promise();

    const emailUsername = alertExists.Item.email.split("@")[0];
    const userTopicArn = `arn:aws:sns:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:user-alerts-${emailUsername}`;

    // 3. Push sns notification to mail subscriber for deletion
    const message = `Alert with ID: ${alertID} for ${alertExists.Item.symbol} by userID: ${userID} has been deleted.\n
    Symbol: ${alertExists.Item.symbol}\n
    Conditions: ${alertExists.Item.condition} at price: ${alertExists.Item.price}\n
    Upper Bound: ${alertExists.Item.upperBound}, Lower Bound: ${alertExists.Item.lowerBound}\n`;

    const params = {
      TopicArn: userTopicArn,
      Subject: `Alert Deletion Notification for ${userID}`,
      Message: message,
    };

    await sns.publish(params).promise();
    console.log("📬 SNS Notification sent for alert deletion:", message);

    // Log the successful deletion
    console.log(
      `✅ Alert with ID: ${alertID} for userID: ${userID} deleted successfully.`
    );

    // 4. Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Alert deleted successfully." }),
    };
  } catch (error) {
    console.error("❌ Error deleting alert:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "❌ Internal Server Error",
        message: "An error occurred while deleting the alert.",
      }),
    };
  }
};
