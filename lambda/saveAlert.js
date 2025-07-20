// i8.3 : Save Alert API and Lambda Function
// Lambda function handling POST /alerts

const AWS = require("aws-sdk");
const db = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    // 0. parse JSON body
    const { userID, symbol, condition, threshold } = JSON.parse(
      event.body || "{}"
    );

    // 1. validate input
    if (
      !userID ||
      !symbol ||
      !condition ||
      threshold === null ||
      threshold === undefined
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Missing required fields: userID, symbol, condition, threshold",
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
          alertID,
          symbol,
          condition,
          threshold,
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
