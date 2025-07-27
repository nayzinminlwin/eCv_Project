// import aws sdk and http modules
const { rejects } = require("assert");
const AWS = require("aws-sdk");
const { log, timeStamp } = require("console");
const https = require("https");
const { resolve } = require("path");
const s3 = new AWS.S3();

async function fetch_and_write_to_s3(symbol) {
  // define file name to be uploaded
  const lastFileKey = `reports/most_recent_report_4_${symbol}.json`;
  // i3
  // Prepared REST endpoint for the data fetch

  // supported currencies: https://api.coingecko.com/api/v3/simple/supported_vs_currencies

  // i3.1 : Define test URL for data fetch
  let myURL = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${symbol}`;

  // Uncomment below to test with a broken URL
  // // broken URL for error handling testing
  // const myURL =
  //   "https://api.coi/api/v3/coins/markets?vs_currency=myr&ids=bitcoin&order=market_cap_desc&per_page=1&page=1&sparkline=false";

  console.log(`🦮Fetching data from URL: ${myURL}`);

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
    symbol: coinData.symbol,
    currentPrice: coinData.current_price,
    // statusFlag: coinData.price_change_24h <= -500,
  }));

  //i3.4 : Log the transformed report object
  console.log("Procesed report: ", JSON.stringify(report, null, 2));

  //   // Assemble a payload
  //   {
  //     const payload = {
  //       message: "This is test file from Lambda",
  //       timeStamp: new Date().toISOString(),
  //     };
  //   }

  //   // Bulding a S3 key under 'reports/' so it is easy to find
  //   const key = `reports/test-${Date.now()}.json`;

  //   await s3
  //     .putObject({
  //       Bucket: process.env.BUCKET_NAME, // injected by the CDK Stack
  //       Key: key,
  //       Body: JSON.stringify(report, null, 2),
  //       ContentType: "application/json",
  //     })
  //     .promise();

  //   console.log(
  //     `✅ Uploaded test file to s3://${process.env.BUCKET_NAME}/${key}`
  //   );

  // i8.7 : Prepare the most recent report and upload to S3
  console.log(`Calling key : ${lastFileKey}`);
  await s3
    .putObject({
      Bucket: process.env.BUCKET_NAME, // injected by the CDK Stack
      Key: lastFileKey,
      Body: JSON.stringify(report, null, 2),
      ContentType: "application/json",
    })
    .promise();

  console.log(
    `✅ Uploaded most recent report to s3://${process.env.BUCKET_NAME}/${lastFileKey}`
  );
  return coinData;
}

module.exports = {
  fetch_and_write_to_s3,
};
