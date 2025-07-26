// import aws sdk and http modules
const { rejects } = require("assert");
const AWS = require("aws-sdk");
const { log, timeStamp } = require("console");
const https = require("https");
const { resolve } = require("path");
const s3 = new AWS.S3();
const sns = new AWS.SNS();
const db = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  // i6
  try {
    // log a message to cloudwatch logs
    console.log("Lambda Function is running!!");

    // i8.6: Load all alert configurations from DynamoDB
    let alertConfigs;
    try {
      const result = await db
        .scan({
          TableName: process.env.TABLE_NAME, // injected by CDK
        })
        .promise();
      alertConfigs = result.Items || [];
      console.log(
        `Loaded ${alertConfigs.length} alert configs: `,
        JSON.stringify(alertConfigs, null, 2)
      );
    } catch (err) {
      console.error("❌ Failed to load alert configurations: ", err);
      throw err;
    }

    // optional : inspecting the incoming 'event'
    console.log("Event received : " + JSON.stringify(event));

    const {
      alertID,
      userID,
      email,
      symbol,
      condition,
      upperBound,
      lowerBound,
    } = alertConfigs[0] || {};

    // i3
    // https://api.coingecko.com/api/v3/coins/markets?vs_currency=myr&ids=bitcoin&order=market_cap_desc&per_page=1&page=1&sparkline=false
    // Prepared REST endpoint for the data fetch

    // supported currencies: https://api.coingecko.com/api/v3/simple/supported_vs_currencies

    // i3.1 : Define test URL for data fetch
    const myURL = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbol=${symbol}&order=market_cap_desc&per_page=1&page=1&sparkline=false`;

    // Uncomment below to test with a broken URL
    // // broken URL for error handling testing
    // const myURL =
    //   "https://api.coi/api/v3/coins/markets?vs_currency=myr&ids=bitcoin&order=market_cap_desc&per_page=1&page=1&sparkline=false";

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

    // i7.2 : Prepare SNS params
    const snsParams = {
      TopicArn: process.env.ALERT_TOPIC_ARN, // injected by the CDK Stack
      Subject: `Crypto Alert for ${report[0].cryptoName}`,
      Message: `Current Price: $${report[0].currentPrice}\nStatus Flag: ${report[0].statusFlag}\nTimestamp: ${report[0].timestamp}`,
    };

    const trigger = conditionProcessing(
      condition,
      0,
      coinData.current_price,
      upperBound,
      lowerBound,
      coinData.high_24h,
      coinData.low_24h,
      coinData.price_change_24h
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

function snsPublish(message, symbol) {
  sns.publish({
    topicArn: process.env.ALERT_TOPIC_ARN, // injected by CDK
    subject: `Crypto Alert for ${symbol}`,
    message: message,
  });
}

function conditionProcessing(
  condition,
  previousPrice,
  currentPrice,
  defPrice = upperBound,
  lowerBound,
  high24,
  low24,
  change24
) {
  let crossUp, crossDown;
  switch (condition) {
    case "crossUp":
      if (previousPrice < defPrice && currentPrice >= defPrice)
        return `Current price: ${currentPrice}$ crossed up the ${defPrice} threshold.`;

    case "crossDown":
      if (previousPrice > defPrice && currentPrice <= defPrice)
        return `Current price: ${currentPrice}$ crossed down the ${defPrice} threshold.`;

    case "cross":
      if (crossUp || crossDown)
        return `Current price: ${currentPrice}$ crossed the ${defPrice} threshold.`;

    case "exCh":
      const crossDownLowerBound = conditionProcessing(
        "crossDown",
        previousPrice,
        currentPrice,
        lowerBound,
        0
      );
      const crossUpUpperBound = conditionProcessing(
        "crossUp",
        previousPrice,
        currentPrice,
        defPrice,
        0
      );
      if (crossDownLowerBound || crossUpUpperBound)
        return `Current price: ${currentPrice}$ is exiting channel from upperBound: ${defPrice}$ and lowerBound: ${lowerBound}$.`;

    case "entCh":
      const crossDownUpperBound = conditionProcessing(
        "crossDown",
        previousPrice,
        currentPrice,
        defPrice,
        0
      );
      const crossUpLowerBound = conditionProcessing(
        "crossUp",
        previousPrice,
        currentPrice,
        lowerBound,
        0
      );
      if (crossDownUpperBound || crossUpLowerBound)
        return `Current price: ${currentPrice}$ is entering channel between upperBound: ${defPrice}$ and lowerBound: ${lowerBound}$.`;

    case "24_High":
      if (defPrice > high24)
        return `Defined price: ${defPrice}$ is above the 24-hour high of ${high24}$.\n Current price: ${currentPrice}$.`;

    case "24_Low":
      if (defPrice < low24)
        return `Defined price: ${defPrice}$ is below the 24-hour low of ${low24}$.\n Current price: ${currentPrice}$.`;

    case "priceChange_24":
      if (defPrice > change24)
        return `Defined price: ${defPrice}$ is above the 24-hour price change of ${change24}$.\n Current price: ${currentPrice}$.`;

    default:
      throw new Error(`Unknown condition: ${condition}`);
  }
}
