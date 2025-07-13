// import aws sdk and http modules
const { rejects } = require("assert");
const AWS = require("aws-sdk");
const { log, timeStamp } = require("console");
const https = require("https");
const { resolve } = require("path");
const s3 = new AWS.S3();
const sns = new AWS.SNS();

exports.handler = async (event) => {
  // i6
  try {
    // log a message to cloudwatch logs
    console.log("Lambda Function is running!!");

    // optional : inspecting the incoming 'event'
    console.log("Event received : " + JSON.stringify(event));

    // i3
    // https://api.coingecko.com/api/v3/coins/markets?vs_currency=myr&ids=bitcoin&order=market_cap_desc&per_page=1&page=1&sparkline=false
    // Prepared REST endpoint for the data fetch

    // i3.1 : Define test URL for data fetch
    // const myURL =
    //   "https://api.coingecko.com/api/v3/coins/markets?vs_currency=myr&ids=bitcoin&order=market_cap_desc&per_page=1&page=1&sparkline=false";

    // broken URL for error handling testing
    const myURL =
      "https://api.coi/api/v3/coins/markets?vs_currency=myr&ids=bitcoin&order=market_cap_desc&per_page=1&page=1&sparkline=false";

    //i3.2 : Fetch JSON from URL
    const rawData = await new Promise((resolve, reject) => {
      const req = https.get(
        myURL,
        {
          // mimicking a valid user data fetch from chrome, avoiding 403 or bot denials.
          headers: {
            Accept: "application/json",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
              "AppleWebKit/537.36 (KHTML, like Gecko) " +
              "Chrome/114.0.0.0 Safari/537.36",
          },
        },
        (res) => {
          let body = "";

          // Non-200 Response check
          if (res.statusCode != 200) {
            return reject(
              new Error(
                `Non-200 Response : ${res.statusCode} ${res.statusMessage}`
              )
            );
          }

          // collect data chunks
          res.on("data", (chunk) => (body += chunk));

          // On end, parse and resolve
          res.on("end", () => resolve(body));

          // Error catch
          res.on("error", (err) => reject(err));
        }
      );
      req.on("error", (err) => reject(err));
    });

    // [{object}]
    // Parse the JSON and get the first object from the array
    const parsedData = JSON.parse(rawData);
    // array got only one room [0] and it hold the object.
    const coinData = parsedData[0] || {};

    // seeing the raw data
    console.log("RawData response body : " + JSON.stringify(coinData));

    //i3.3 : Transform into 'report' schema
    // Example: pick just two specific fields from the raw JSON
    const report = [coinData].map((item) => ({
      timestamp: new Date().toISOString(),
      cryptoName: coinData.name,
      currentPrice: coinData.current_price,
      statusFlag: coinData.price_change_24h <= -500,
    }));

    //i3.4 : Log the transformed report object
    console.log("Procesed report: ", JSON.stringify(report, null, 2));

    // // Assemble a payload
    // const payload = {
    //   message: "This is test file from Lambda",
    //   timeStamp: new Date().toISOString(),
    // };

    // Bulding a S3 key under 'reports/' so it is easy to find
    const key = `reports/test-${Date.now()}.json`;

    await s3
      .putObject({
        Bucket: process.env.BUCKET_NAME, // injected by the CDK Stack
        Key: key,
        Body: JSON.stringify(report, null, 2),
        ContentType: "application/json",
      })
      .promise();

    console.log(
      `✅ Uploaded test file to s3://${process.env.BUCKET_NAME}/${key}`
    );

    // return success to see in the Lambda console
    return {
      statusCode: 200,
      body: JSON.stringify(report),
    };
    // i6
  } catch (err) {
    console.error("❌ Pipeline failed : ", err);

    // checking if the environment variable is set
    console.log(
      "🔍 ERROR_ALERT_TOPIC_ARN =",
      process.env.ERROR_ALERT_TOPIC_ARN
    );

    // i7.1 : Prepare SNS params
    const params = {
      TopicArn: process.env.ERROR_ALERT_TOPIC_ARN, // injected by the CDK Stack
      Subject: `Lambda Pipeline Failed in ${process.env.AWS_LAMBDA_FUNCTION_NAME}`,
      Message:
        `Error occurred at ${new Date().toISOString()}\n\n` +
        `Error details: ${err.message}\n\n` +
        `Stack trace: ${err.stack}`,
    };

    // i7.1 : Publish to SNS
    await sns.publish(params).promise();
    console.error("❌ SNS Notification sent for failure");

    // Re-throw the error to stop the pipeline
    throw err;
  }
};
