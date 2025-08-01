// import aws sdk and http modules
const AWS = require("aws-sdk");
const sns = new AWS.SNS();
const db = new AWS.DynamoDB.DocumentClient();
const { writePrice_to_DynamoDB, fetch_AssetsData } = require("./fetch_n_write"); // Importing from fetch_n_write.js

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

    //i12 : Fetch all previous price from DynamoDB
    let previousPriceData;
    try {
      const result = await db
        .scan({
          TableName: process.env.PRICE_TABLE_NAME, // injected by CDK
        })
        .promise();
      previousPriceData = result.Items || [];
      console.log(
        `Loaded ${previousPriceData.length} Price data : `,
        JSON.stringify(previousPriceData, null, 2)
      );
    } catch (err) {
      console.error("❌ Failed to load alert configurations: ", err);
      throw err;
    }

    // optional : inspecting the incoming 'event'
    // console.log("Event received : " + JSON.stringify(event));

    let symbols = new Set();

    //i12 : put all symbols from alertConfigs into a Set
    for (const alerts of alertConfigs) {
      const { symbol } = alerts || {};
      if (symbol) {
        symbols.add(symbol);
      }
    }

    // i12 : Fetch the current price for each symbol
    const assetsData = await fetch_AssetsData(symbols);

    // Comparison for each alert configuration
    for (const alerts of alertConfigs) {
      const { alertID, symbol, condition, price, upperBound, lowerBound } =
        alerts || {};

      // i8.7: Evaluating the condition
      const trigger = conditionProcessing(
        condition,
        previousPriceData.find((item) => item.symbol === symbol)?.lastPrice,
        assetsData[symbol]?.current_price,
        price,
        upperBound,
        lowerBound,
        assetsData[symbol]?.high_24h,
        assetsData[symbol]?.low_24h,
        assetsData[symbol]?.price_change_24h
      );

      // i7.3 : Publish to SNS if condition is met
      if (trigger) {
        const msg = `Alert for ${alertID} (${symbol}): ${trigger}\n`;
        console.log("\n📢 Triggered condition: ", msg);

        const params = {
          TopicArn: process.env.USER_ALERT_TOPIC_ARN, // injected by CDK
          Subject: `Crypto Alert for ${assetsData[symbol]?.id}/${symbol}`,
          Message: msg,
        };

        console.log("🔔 Publishing params: ", params);
        // sns publish
        await sns.publish(params).promise();
      } else {
        console.log("🔕 No condition met, no alert sent.");
      }
    }

    // write new price data to DynamoDB
    await writePrice_to_DynamoDB(assetsData);

    // return success to see in the Lambda console
    console.log("✅ Pipeline completed successfully via DynamoDB.");
  } catch (err) {
    // i6.1 : Log the error
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

// i8.7: Condition processing function
// This function checks the current price against the defined conditions and returns a message if the condition is met.
function conditionProcessing(
  condition,
  previousPrice,
  currentPrice,
  defPrice,
  upperBound = 0,
  lowerBound = 0,
  high24 = 0,
  low24 = 0,
  change24 = 0
) {
  console.log(
    `Processing condition: ${condition}, Previous Price: ${previousPrice}, Current Price: ${currentPrice}, Defined Price: ${defPrice}, Upper Bound: ${upperBound}, Lower Bound: ${lowerBound}, 24h High: ${high24}, 24h Low: ${low24}, 24h Change: ${change24}`
  );

  switch (condition) {
    case "crossUp":
      if (previousPrice < defPrice && currentPrice >= defPrice)
        return `Current price: ${currentPrice}$ crossed up the $${defPrice} threshold. \n 
      Previous Price : $${previousPrice} \n
      Defined Price : $${defPrice} \n
      Current Price : $${currentPrice} \n`;
      break;

    case "crossDown":
      if (previousPrice > defPrice && currentPrice <= defPrice)
        return `Current price: ${currentPrice}$ crossed down the $${defPrice} threshold. \n
      Previous Price : $${previousPrice} \n
      Defined Price : $${defPrice} \n
      Current Price : $${currentPrice} \n`;
      break;

    case "cross":
      if (
        (previousPrice < defPrice && currentPrice >= defPrice) ||
        (previousPrice > defPrice && currentPrice <= defPrice)
      )
        return `Current price: ${currentPrice}$ crossed the $${defPrice} threshold. \n
      Previous Price : $${previousPrice} \n
      Defined Price : $${defPrice} \n
      Current Price : $${currentPrice} \n`;
      break;

    case "exCh":
      if (
        (previousPrice > lowerBound && currentPrice <= lowerBound) ||
        (previousPrice < upperBound && currentPrice >= upperBound)
      )
        return `Current price: ${currentPrice}$ is exiting channel from upperBound: ${upperBound}$ and lowerBound: ${lowerBound}$. \n
      Previous Price : $${previousPrice} \n
      Defined Prices : $${upperBound} - $${lowerBound} \n
      Current Price : $${currentPrice} \n`;
      break;

    case "entCh":
      if (
        (previousPrice < lowerBound && currentPrice >= lowerBound) ||
        (previousPrice > upperBound && currentPrice <= upperBound)
      ) {
        let rtnMsg = `Current price: ${currentPrice}$ is entering channel between upperBound: ${upperBound}$ and lowerBound: ${lowerBound}$. \n
      Previous Price : $${previousPrice} \n
      Defined Prices : $${upperBound} - $${lowerBound} \n
      Current Price : $${currentPrice} \n`;
        if (currentPrice > upperBound || currentPrice < lowerBound) {
          rtnMsg += `\n⚠️ Warning: Current price already exited the defined channel bounds!`;
        }
        return rtnMsg;
      }
      break;

    case "24_High":
      if (defPrice < high24)
        return `24-hour high of ${high24}$ is exceeding the Defined price: ${defPrice}$.\n Current price: ${currentPrice}$.`;
      break;

    case "24_Low":
      if (defPrice > low24)
        return `24-hour low of ${low24}$ is below the Defined price: ${defPrice}$.\n Current price: ${currentPrice}$.`;
      break;

    case "priceChange_24":
      if (defPrice > change24)
        return `Defined price: ${defPrice}$ is above the 24-hour price change of ${change24}$.\n Current price: ${currentPrice}$.`;
      break;

    default:
      return null;
    // throw new Error(`Unknown condition: ${condition}`);
  }
}
