// i8.3 : Save Alert API and Lambda Function
// Lambda function handling POST /alerts

const AWS = require("aws-sdk");
const db = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    // i8.1 : Log incoming event
    console.log(
      "😴 Received event:",
      JSON.stringify({
        isBase64: event.isBase64Encoded,
        headers: event.headers,
        body: event.body,
      })
    );

    // 0. parse JSON body
    const { userID, email, symbol, condition, price, lowerBound } = JSON.parse(
      event.body || "{}"
    );

    // 1. validate input
    if (
      !userID ||
      userID.trim() === "" ||
      !email ||
      !symbol ||
      !condition ||
      price === null ||
      price === undefined ||
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
    const alertID = `${userID}-${symbol}-${Date.now()}`;

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
          lowerBound,
          createdAt: new Date().toISOString(),
        },
      })
      .promise();

    // 4. Return success response
    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Alert saved successfully",
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
