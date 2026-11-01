# GRInvestment

**Private Bond Investments · Portfolio Analytics · AI-Powered Investor Support**

*“What changed in my investment—and what does it mean for me?”*

GRInvestment is an investor portal built for private bond investments. It brings portfolio performance, bond-market data, and a document-grounded AI assistant into one place, helping investors understand their holdings and ask follow-up questions after investing.

## What investors can do

- **Track their investment:** view investment cost, estimated value, returns, bond prices, and yield to maturity.
- **Understand return drivers:** see how bond-price movements and accrued coupon interest contribute to performance.
- **Get grounded explanations:** the AI assistant combines portfolio figures and bond-price data from S3 with product documents retrieved through Amazon Bedrock Knowledge Bases (RAG).

## My contribution

I gathered client requirements, designed and developed the portal, and launched it for **five family office users**. The project combines my fixed-income experience with data engineering and application development—from collecting bond data in Python and calculating investment performance to building the dashboard and Lambda-based AI assistant.

## Built with

**Python · Selenium · JavaScript · Chart.js · AWS Lambda · Amazon Bedrock · Knowledge Bases · Cognito · S3 · Docker**

## Explore the code

- [`ai_chatbot_lambda/lambda_script.py`](ai_chatbot_lambda/lambda_script.py) — portfolio analysis, document retrieval, and AI responses.
- [`goldrain-dev/`](goldrain-dev/) — investor dashboard, authentication, and chat interface.
- [`web_scraper_v2/scraper.py`](web_scraper_v2/scraper.py) — bond-data extraction, cleaning, and S3 history storage.

*AWS resources, access policies, and deployment configuration are managed separately.*
