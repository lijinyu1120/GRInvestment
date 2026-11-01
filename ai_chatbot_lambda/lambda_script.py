import json
import boto3

s3 = boto3.client("s3")
bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")
bedrock_agent_runtime = boto3.client("bedrock-agent-runtime", region_name="us-east-1")

MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

BUCKET_NAME = "gold-rain-investment-portfolio-bucket"
BOND_PRICE_KEY = "bond_values_093027.json"
DEFAULT_USER_ID = "0458d478-3091-70c5-a70d-92c8ed3c7965"

KNOWLEDGE_BASE_ID = "PFIFAZ9DQN"


def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body", "{}"))
        user_message = body.get("message", "Please summarize my bond portfolio.")
        user_id = body.get("userId", DEFAULT_USER_ID)

        portfolio_key = f"portfolios/{user_id}/portfolio.json"

        portfolio = read_json_from_s3(BUCKET_NAME, portfolio_key)
        bond_prices = read_json_from_s3(BUCKET_NAME, BOND_PRICE_KEY)

        latest_price = bond_prices[-1]
        first_price = bond_prices[0]

        analysis_data = build_analysis_data(portfolio, latest_price, first_price)

        kb_context = retrieve_from_knowledge_base(user_message)

        prompt = build_prompt(
            user_message=user_message,
            user_id=user_id,
            portfolio=portfolio,
            latest_price=latest_price,
            first_price=first_price,
            analysis_data=analysis_data,
            kb_context=kb_context
        )

        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 800,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        }

        result = bedrock.invoke_model(
            modelId=MODEL_ID,
            body=json.dumps(request_body)
        )

        result_body = json.loads(result["body"].read())
        answer = result_body["content"][0]["text"]

        return response(200, {
            "answer": answer,
        })

    except Exception as e:
        print("ERROR:", str(e))
        return response(500, {"error": str(e)})


def read_json_from_s3(bucket, key):
    obj = s3.get_object(Bucket=bucket, Key=key)
    return json.loads(obj["Body"].read().decode("utf-8"))


def retrieve_from_knowledge_base(query):
    try:
        result = bedrock_agent_runtime.retrieve(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            retrievalQuery={
                "text": query
            },
            retrievalConfiguration={
                "vectorSearchConfiguration": {
                    "numberOfResults": 5
                }
            }
        )

        chunks = []

        for item in result.get("retrievalResults", []):
            content = item.get("content", {}).get("text", "")
            location = item.get("location", {})
            score = item.get("score")

            chunks.append({
                "content": content,
                "location": location,
                "score": score
            })

        return chunks

    except Exception as e:
        print("KB RETRIEVE ERROR:", str(e))
        return []


def build_analysis_data(portfolio, latest_price, first_price):
    bond = portfolio.get("holdings", {}).get("BOND", {})

    nominal_principal = to_float(bond.get("nominalPrincipal"))
    actual_trade_amount = to_float(bond.get("actualTradeAmount"))
    avg_cost = to_float(bond.get("avgCost"))
    purchase_date = bond.get("purchaseDate")

    latest_mid = to_float(latest_price.get("价格_中间价"))
    latest_bid = to_float(latest_price.get("价格_买价"))
    latest_ask = to_float(latest_price.get("价格_卖价"))
    latest_ytm_mid = to_float(latest_price.get("到期收益率(YTM)_中间价"))
    latest_mid_change = to_float(latest_price.get("涨跌额_中间价"))
    latest_liquidity = to_float(latest_price.get("流动性分数_中间价"))
    latest_accrued_interest = to_float(latest_price.get("应付利息"))
    latest_volume_30d = to_float(latest_price.get("30天成交量"))

    first_mid = to_float(first_price.get("价格_中间价"))

    clean_market_value = None
    accrued_interest_amount = None
    estimated_dirty_value = None
    unrealized_pnl_clean = None
    unrealized_pnl_dirty = None
    price_change_from_cost = None
    price_change_from_first_record = None
    return_pct_clean = None
    return_pct_dirty = None

    if nominal_principal is not None and latest_mid is not None:
        clean_market_value = nominal_principal * latest_mid / 100

    if nominal_principal is not None and latest_accrued_interest is not None:
        accrued_interest_amount = nominal_principal * latest_accrued_interest / 100

    if clean_market_value is not None and accrued_interest_amount is not None:
        estimated_dirty_value = clean_market_value + accrued_interest_amount

    if clean_market_value is not None and actual_trade_amount is not None:
        unrealized_pnl_clean = clean_market_value - actual_trade_amount
        return_pct_clean = unrealized_pnl_clean / actual_trade_amount * 100

    if estimated_dirty_value is not None and actual_trade_amount is not None:
        unrealized_pnl_dirty = estimated_dirty_value - actual_trade_amount
        return_pct_dirty = unrealized_pnl_dirty / actual_trade_amount * 100

    if latest_mid is not None and avg_cost is not None:
        price_change_from_cost = latest_mid - avg_cost

    if latest_mid is not None and first_mid is not None:
        price_change_from_first_record = latest_mid - first_mid

    return {
        "ignoredField": "shares is intentionally ignored because it is no longer relevant.",
        "nominalPrincipal": nominal_principal,
        "actualTradeAmount": actual_trade_amount,
        "avgCost": avg_cost,
        "purchaseDate": purchase_date,
        "latestTimestamp": latest_price.get("timestamp"),
        "latestBidPrice": latest_bid,
        "latestMidPrice": latest_mid,
        "latestAskPrice": latest_ask,
        "latestYtmMid": latest_ytm_mid,
        "latestMidPriceDailyChange": latest_mid_change,
        "latestLiquidityScoreMid": latest_liquidity,
        "latestAccruedInterestPer100": latest_accrued_interest,
        "latest30DayVolume": latest_volume_30d,
        "cleanMarketValueEstimate": clean_market_value,
        "accruedInterestAmountEstimate": accrued_interest_amount,
        "dirtyMarketValueEstimate": estimated_dirty_value,
        "unrealizedPnlCleanEstimate": unrealized_pnl_clean,
        "unrealizedPnlDirtyEstimate": unrealized_pnl_dirty,
        "returnPctCleanEstimate": return_pct_clean,
        "returnPctDirtyEstimate": return_pct_dirty,
        "priceChangeFromAvgCost": price_change_from_cost,
        "priceChangeFromFirstRecord": price_change_from_first_record
    }


def build_prompt(user_message, user_id, portfolio, latest_price, first_price, analysis_data, kb_context):
    return f"""
You are AI Bond Assistant for Gold Rain Investment.

Very important data rule:
- Completely ignore the "shares" field in the portfolio JSON.
- The "shares" field is outdated and irrelevant.
- Use "nominalPrincipal", "actualTradeAmount", and "avgCost" instead.

Knowledge Base rule:
- Use the Knowledge Base context when answering questions about bond terms, issuer, underlying asset, risk factors, product structure, or product details.
- If the Knowledge Base context does not contain enough information, say the document does not provide enough detail.
- Do not invent product details that are not in the Knowledge Base context.

Response style:
- Detect the language of the user's message.
- If the user writes in Chinese, respond ONLY in Chinese.
- If the user writes in English, respond ONLY in English.
- Never mix languages in a single response.
- Use simple, clear, professional, wealth-management-style language.
- Maintain a calm, confident, and constructive tone.
- Do not use Markdown headings.
- Do not use #, ##, ---, tables, or bullet-heavy formatting.
- Keep the total answer concise, maximum 4 sentences.

Compliance rules:
- Do not provide explicit buy, sell, or hold recommendations.
- Do not guarantee returns or principal protection.
- Clearly state when values are estimates based on available S3 data.
- Only use the provided portfolio data, bond price data, and Knowledge Base context.
- Do not invent market news or macroeconomic events.

Positive framing guidance:
- If bond prices decline, explain calmly that bond prices can fluctuate with market conditions and yield movements.
- If YTM increases, explain that higher yields may improve income potential for long-term investors, while also reflecting market risk.
- Emphasize diversification, income characteristics, and long-term investment perspective when appropriate.
- Focus on balanced interpretation instead of short-term market emotion.
- When discussing risks, present them professionally and constructively rather than fearfully.

Finance interpretation:
- Bond price is quoted as percentage of par value.
- Clean market value estimate = nominal principal × current mid price / 100.
- Dirty value estimate includes accrued interest.
- Bond price fluctuations are normal in fixed income markets.
- Higher YTM may indicate enhanced income opportunities, but can also reflect changing market conditions or credit risk.
- Liquidity score helps indicate trading conditions in the secondary market.

User ID:
{user_id}

User question:
{user_message}

Portfolio JSON:
{json.dumps(portfolio, ensure_ascii=False, indent=2)}

First bond price record:
{json.dumps(first_price, ensure_ascii=False, indent=2)}

Latest bond price record:
{json.dumps(latest_price, ensure_ascii=False, indent=2)}

Calculated analysis data:
{json.dumps(analysis_data, ensure_ascii=False, indent=2)}

Knowledge Base retrieved context:
{json.dumps(kb_context, ensure_ascii=False, indent=2)}

Now answer the user using the portfolio data, bond price data, and Knowledge Base context.
"""


def to_float(value):
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "OPTIONS,POST"
        },
        "body": json.dumps(body, ensure_ascii=False)
    }