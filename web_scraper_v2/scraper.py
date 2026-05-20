# scraper.py
import os
import time
import json
from datetime import datetime

from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException
from bs4 import BeautifulSoup
from selenium.webdriver.chrome.options import Options
import boto3
from botocore.exceptions import BotoCoreError, ClientError

# =========================
# Config (env-driven)
# =========================
load_dotenv()  # Load .env into process env

BOND_DETAIL_URL = "https://www.97caijing.com/primaryMarket/bondDetail/119108"

# Site login
LOGIN_PHONE = os.getenv("SITE_PHONE")         # e.g., 13810839303
LOGIN_PASSWORD = os.getenv("SITE_PASSWORD")   # e.g., your_password

# S3 config
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
S3_BUCKET = os.getenv("S3_BUCKET", "gold-rain-investment-portfolio-bucket")  # default to new bucket
S3_PREFIX = os.getenv("S3_PREFIX", "")  # no prefix for new location
# Single S3 key that stores the entire history file
S3_HISTORY_KEY = os.getenv("S3_HISTORY_KEY", "bond_values_093027.json")

# Optional local backup (set to '' to disable)
LOCAL_BACKUP_JSON = os.getenv("LOCAL_BACKUP_JSON", "bond_values_093027.json")

# Retry
MAX_RETRIES = 3
RETRY_WAIT = 10

# History cap
MAX_HISTORY = int(os.getenv("MAX_HISTORY", "1000"))

# =========================
# Selenium helpers
# =========================
def start_browser():
    """Start Chrome browser configured for Docker environment."""
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")  # This replaces maximize_window()
    
    driver = webdriver.Chrome(options=chrome_options)
    driver.get(BOND_DETAIL_URL)
    return driver

def wait_for_login_modal(driver, attempt, max_retries, wait_time):
    try:
        print(f"⏳ Waiting for login modal... Attempt {attempt + 1}/{max_retries}")
        # Updated XPath to match the actual HTML structure
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.XPATH, '//input[@placeholder="请输入手机号"]'))
        )
        print("✅ Login modal found!")
        return True
    except TimeoutException:
        print(f"❌ Login modal not found. Restarting browser in {wait_time} seconds...")
        driver.quit()
        time.sleep(wait_time)
        return False

# =========================
# Parsing & cleaning
# =========================
def extract_bond_data(soup):
    """Extract all bond data from the parsed HTML"""
    values = {"timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

    main_div = soup.find('div', attrs={'_nk': '156Q112'})
    if not main_div:
        print("❌ Main data container not found")
        return values

    data_rows = main_div.find_all('div', attrs={'_nk': 'iAr156Q114'})
    for row in data_rows:
        label_span = row.find('span', attrs={'_nk': '156Q38'})
        if not label_span:
            continue

        label = label_span.get_text(strip=True)
        value_spans = row.find_all('span', attrs={'_nk': ['iAr156Q39', '156Q3a']})

        if len(value_spans) == 3:  # 买价, 中间价, 卖价
            values[f"{label}_买价"] = value_spans[0].get_text(strip=True)
            values[f"{label}_中间价"] = value_spans[1].get_text(strip=True)
            values[f"{label}_卖价"] = value_spans[2].get_text(strip=True)
        elif len(value_spans) == 1:  # Single value (e.g., 应付利息, 30天成交量)
            values[label] = value_spans[0].get_text(strip=True)
    return values

def clean_numeric_value(value_str):
    """Clean numeric values by removing '+', keeping negative signs, and converting '--' to None"""
    if value_str == '--':
        return None
    if value_str.startswith('+'):
        return value_str[1:]
    return value_str

def process_extracted_data(values):
    """Process and clean the extracted data"""
    processed_values = {"timestamp": values.get("timestamp", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))}

    numeric_fields = [
        "价格", "涨跌额", "最差收益率(YTW)", "到期收益率(YTM)", "流动性分数",
        "G利差", "I利差", "T利差", "Z利差", "麦考利久期", "修正久期", "凸性",
        "应付利息", "30天成交量"
    ]

    for field in numeric_fields:
        if field in values:
            processed_values[field] = clean_numeric_value(values[field])
        else:
            for suffix in ["_买价", "_中间价", "_卖价"]:
                key = f"{field}{suffix}"
                if key in values:
                    processed_values[key] = clean_numeric_value(values[key])

    return processed_values

# =========================
# S3 helpers (history in a single file)
# =========================
def s3_client():
    """Create an S3 client using default AWS credential chain (env, profile, role)."""
    return boto3.client("s3", region_name=AWS_REGION)

def load_history_from_s3():
    """Load the existing JSON history array from S3. Return [] if not found."""
    s3 = s3_client()
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=S3_HISTORY_KEY)
        body = obj["Body"].read()
        data = json.loads(body.decode("utf-8"))
        if isinstance(data, list):
            return data
        # If the file exists but isn't a list, wrap it
        return [data]
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("NoSuchKey", "404"):
            print("ℹ️ No existing history file in S3. A new one will be created.")
            return []
        print(f"❌ Error reading history from S3: {e}")
        return []
    except (BotoCoreError, Exception) as e:
        print(f"❌ Error reading history from S3: {e}")
        return []

def save_history_to_s3(history_list):
    """Save the full history list back to S3."""
    s3 = s3_client()
    try:
        payload = json.dumps(history_list, ensure_ascii=False, indent=2).encode("utf-8")
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=S3_HISTORY_KEY,
            Body=payload,
            ContentType="application/json; charset=utf-8"
        )
        print(f"✅ Saved history to s3://{S3_BUCKET}/{S3_HISTORY_KEY} (records={len(history_list)})")
        return True
    except (BotoCoreError, ClientError) as e:
        print(f"❌ Failed to write history to S3: {e}")
        return False

# Optional: local backup for peace of mind
def save_local_backup(history_list):
    if not LOCAL_BACKUP_JSON:
        return
    try:
        with open(LOCAL_BACKUP_JSON, "w", encoding="utf-8") as f:
            json.dump(history_list, f, ensure_ascii=False, indent=2)
        print(f"💾 Local backup: {LOCAL_BACKUP_JSON}")
    except Exception as e:
        print(f"⚠️ Failed local backup: {e}")

# =========================
# Main
# =========================
def main():
    driver = None
    if not LOGIN_PHONE or not LOGIN_PASSWORD:
        print("⚠️ SITE_PHONE / SITE_PASSWORD not set in environment. Attempting without login…")

    # 1) Launch browser & retry login modal detection
    login_modal_ready = False
    for attempt in range(MAX_RETRIES):
        try:
            driver = start_browser()
            if LOGIN_PHONE and LOGIN_PASSWORD:
                if wait_for_login_modal(driver, attempt, MAX_RETRIES, RETRY_WAIT):
                    login_modal_ready = True
                    break
            else:
                login_modal_ready = True
                break
        except WebDriverException as e:
            print(f"❌ WebDriver error: {e}")
            time.sleep(RETRY_WAIT)

    if not login_modal_ready:
        print("🚫 Failed to detect login modal after retries. Exiting.")
        if driver:
            driver.quit()
        return 1

    # 2) Fill in login form (if creds provided)
    try:
        if LOGIN_PHONE and LOGIN_PASSWORD:
            # Use the correct selectors based on the actual HTML structure
            phone_input = driver.find_element(By.XPATH, '//input[@placeholder="请输入手机号"]')
            phone_input.send_keys(LOGIN_PHONE)
            pwd_input = driver.find_element(By.XPATH, '//input[@placeholder="请输入密码"]')
            pwd_input.send_keys(LOGIN_PASSWORD)
            login_btn = driver.find_element(By.XPATH, '//button[@type="submit"]//span[text()="登 录"]/..')
            login_btn.click()
            print("✅ Login form submitted")
            time.sleep(5)
    except Exception as e:
        print(f"❌ Error filling login form: {e}")
        driver.quit()
        return 1

    # 3) Load the bond detail page
    driver.get(BOND_DETAIL_URL)
    time.sleep(3)

    # 4) Parse HTML & extract
    try:
        html = driver.page_source
        soup = BeautifulSoup(html, 'html.parser')
        raw_values = extract_bond_data(soup)
        new_record = process_extracted_data(raw_values)
        print("✅ Extracted a new record.")
    except Exception as e:
        print(f"❌ Error extracting bond data: {e}")
        new_record = {"timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    finally:
        driver.quit()

    # 5) Load existing history from S3, append, trim, and save back
    history = load_history_from_s3()
    history.append(new_record)
    if len(history) > MAX_HISTORY:
        history = history[-MAX_HISTORY:]  # keep most recent MAX_HISTORY

    # Save to S3 (single file with full history)
    ok = save_history_to_s3(history)

    # Optional local backup
    if ok and LOCAL_BACKUP_JSON:
        save_local_backup(history)

    return 0 if ok else 2

if __name__ == "__main__":
    raise SystemExit(main())