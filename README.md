# eCv\_ Project: Serverless Asset Alert Pipeline

A fully serverless, end-to-end AWS application that lets users define price/metric alerts on trading assets via a simple web UI—and delivers email notifications when conditions are met.
Built with AWS CDK, Lambda, API Gateway, DynamoDB, EventBridge, SNS, and S3 static hosting.

---

## 🚀 Quickstart

1. **Clone the repo**

   ```bash
   git clone https://github.com/nayzinminlwin/eCv_Project.git
   cd eCv_Project
   ```

2. **Install dependencies**  
   Installs CDK, esbuild, AWS SDK, and all Lambda dependencies:

   ```bash
   npm install
   npm install aws-sdk
   ```

3. **Bootstrap CDK (first time only)**  
   Deploys the CDK toolkit stack into your AWS account/region:

   ```bash
   npx cdk bootstrap --require-approval never
   ```

4. **Deploy your stack**  
   Creates S3 buckets, Lambdas, API Gateway, DynamoDB table, EventBridge rule, SNS topic, etc.:

   ```bash
   npx cdk deploy --require-approval never
   ```

5. **Access the app**
   - **Static site URL**: check your CDK output for `SiteBucketURL` or check it in AWS S3 Dashboard.
   - It looks like `https://<YourSiteBucketName>.s3-website-<region>.amazonaws.com/`.

---

## 📂 Project Structure

```
├── bin/                     # CDK entrypoint
├── lib/                     # CDK stack definitions
├── lambda/
│   ├── index.js             # scheduled fetcher + alert evaluator
│   ├── saveAlert.js         # POST /alerts handler
│   ├── deleteAlert.js       # DELETE /alerts/{alertId} handler
│   └── fetch_n_write_s3.js  # fetches asset prices and writes to DynamoDB
├── site/                    # Static website assets (HTML + CSS + JS)
│   ├── index.html           # index page with alert form
│   ├── main.js              # js for design, form submission and API calls
│   └── style.css            # CSS styles
├── package.json
├── cdk.json
├── tsconfig.json
└── README.md
```

---

## 🔧 Configuration & Credentials

- Configure your AWS CLI or environment variables:
  ```bash
  aws configure         # or set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
  ```
- Ensure your IAM user has permissions for:
  - CloudFormation, CDK toolkit
  - Lambda, API Gateway, DynamoDB, EventBridge, SNS, S3
    - S3 static website hosting

---

## 🛣️ Roadmap

- Github Actions CI/CD
- Github Deployments for static site
- UI: List & delete alerts
- Multi‑channel notifications (SMS, Slack)
- Metrics dashboard (e.g. AWS QuickSight)
- AWS Certified Cloud Practitioner study & documentation

---

### License

MIT © [Nay Zin Min Lwin](https://github.com/nayzinminlwin),
Lincensed under the [MIT License](https://github.com/nayzinminlwin/eCv_Project/blob/master/LICENSE).
