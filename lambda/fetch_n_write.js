// import aws sdk and http modules
const AWS = require("aws-sdk");
const https = require("https");

// i12 : Fetch the assets in burst to write to DynamoDB
async function fetch_AssetsData(symbols) {
  symbols = [...symbols].join("%2C"); // join symbols with comma for URL

  // if symbols is empty, return an error
  if (!symbols) {
    throw new Error("No symbols provided for fetching assets data.");
  }

  let myURL = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${symbols}`;

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

  // print raw data
  console.log("😶‍🌫️ RawData response body : " + rawData);

  let assetsData = {};
  const parsedData = JSON.parse(rawData);
  // Transform the parsed data into a key-value object
  for (const item of parsedData) {
    const currentItem = {
      id: item.id,
      symbol: item.symbol,
      current_price: item.current_price,
      high_24h: item.high_24h,
      low_24h: item.low_24h,
      price_change_24h: item.price_change_24h,
      lastUpdated: new Date().toISOString(),
    };
    assetsData[item.symbol] = currentItem; // Use symbol as key
  }

  // Log the fetched assets data
  console.log("🍡 Fetched Assets Data: ", JSON.stringify(assetsData, null, 2));

  return assetsData;
}

// i12 : Write the fetched data to DynamoDB
async function writePrice_to_DynamoDB(assetsData) {
  const db = new AWS.DynamoDB.DocumentClient();
  for (const key in assetsData) {
    if (!Object.prototype.hasOwnProperty.call(assetsData, key)) continue; // skip if not a direct property

    console.log(
      `✍️ Writing ${key} : ${JSON.stringify(assetsData[key])} to DynamoDB...`
    );

    // db save
    await db
      .put({
        TableName: process.env.PRICE_TABLE_NAME, // injected by CDK
        Item: {
          symbol: key,
          lastPrice: assetsData[key].current_price,
          lastUpdated: assetsData[key].lastUpdated,
        },
      })
      .promise();

    console.log(`✅ ${key} written to DynamoDB.`);
  }
}

module.exports = {
  writePrice_to_DynamoDB,
  fetch_AssetsData,
};
