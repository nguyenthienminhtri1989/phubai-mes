#!/bin/bash
# check-heartbeat.sh — Kiem tra heartbeat tu mini PC, gui Telegram neu mat ket noi.
#
# Chay bang cron moi 5 phut tren VPS:
#   */5 * * * * /home/ubuntu/phubai-mes/scripts/check-heartbeat.sh
#
# Yeu cau bien moi truong trong .env hoac export truoc:
#   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

HEARTBEAT_FILE="/tmp/minipc-heartbeat"
ALERT_FLAG="/tmp/minipc-alert-sent"
MAX_AGE_SECONDS=660  # 11 phut (2 nhip heartbeat 5ph + 1ph du)

# --- Load .env neu co ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [ -f "$ENV_FILE" ]; then
  # Doc tung dong, bo qua comment va dong trong
  while IFS='=' read -r key value; do
    key=$(echo "$key" | xargs)
    # Bo qua dong trong, comment, dong khong co dau =
    [[ -z "$key" || "$key" == \#* ]] && continue
    # Xoa dau ngoac kep bao quanh value neu co
    value=$(echo "$value" | sed 's/^"//;s/"$//' | sed "s/^'//;s/'$//")
    export "$key=$value"
  done < "$ENV_FILE"
fi

# --- Kiem tra cau hinh ---
if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
  echo "$(date '+%F %T') ERROR: Thieu TELEGRAM_BOT_TOKEN hoac TELEGRAM_CHAT_ID" >&2
  exit 1
fi

# --- Ham gui Telegram ---
send_telegram() {
  local message="$1"
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="$TELEGRAM_CHAT_ID" \
    -d text="$message" \
    -d parse_mode="HTML" \
    > /dev/null 2>&1
}

# --- Kiem tra heartbeat ---
NOW=$(date +%s)

if [ ! -f "$HEARTBEAT_FILE" ]; then
  # Chua co heartbeat lan nao
  if [ ! -f "$ALERT_FLAG" ]; then
    send_telegram "🔴 <b>PHUBAI-MES Cảnh báo</b>
Mini PC chưa gửi heartbeat lần nào.
Kiểm tra: mini PC có đang chạy không?
Thời điểm: $(TZ='Asia/Ho_Chi_Minh' date '+%H:%M %d/%m/%Y')"
    touch "$ALERT_FLAG"
    echo "$(date '+%F %T') ALERT: No heartbeat file, alert sent"
  else
    echo "$(date '+%F %T') ALERT: No heartbeat file (already alerted)"
  fi
  exit 0
fi

# Doc thoi diem heartbeat cuoi
LAST_BEAT=$(cat "$HEARTBEAT_FILE")
# Chuyen ISO timestamp sang epoch seconds
LAST_EPOCH=$(date -d "$LAST_BEAT" +%s 2>/dev/null)

if [ -z "$LAST_EPOCH" ]; then
  echo "$(date '+%F %T') ERROR: Khong doc duoc timestamp: $LAST_BEAT" >&2
  exit 1
fi

AGE=$((NOW - LAST_EPOCH))
AGE_MINUTES=$((AGE / 60))

if [ "$AGE" -gt "$MAX_AGE_SECONDS" ]; then
  # --- MAT KET NOI ---
  if [ ! -f "$ALERT_FLAG" ]; then
    send_telegram "🔴 <b>PHUBAI-MES Cảnh báo</b>
Mini PC mất kết nối!
Heartbeat cuối: ${AGE_MINUTES} phút trước
Lần cuối: $(TZ='Asia/Ho_Chi_Minh' date -d "$LAST_BEAT" '+%H:%M %d/%m/%Y')
Thời điểm phát hiện: $(TZ='Asia/Ho_Chi_Minh' date '+%H:%M %d/%m/%Y')"
    touch "$ALERT_FLAG"
    echo "$(date '+%F %T') ALERT: Offline ${AGE_MINUTES}m, alert sent"
  else
    echo "$(date '+%F %T') ALERT: Still offline ${AGE_MINUTES}m (already alerted)"
  fi
else
  # --- ONLINE BINH THUONG ---
  if [ -f "$ALERT_FLAG" ]; then
    # Da tung canh bao -> gui tin PHUC HOI
    send_telegram "🟢 <b>PHUBAI-MES Phục hồi</b>
Mini PC đã online trở lại!
Thời điểm: $(TZ='Asia/Ho_Chi_Minh' date '+%H:%M %d/%m/%Y')"
    rm -f "$ALERT_FLAG"
    echo "$(date '+%F %T') RECOVERED: Back online, recovery sent"
  else
    echo "$(date '+%F %T') OK: Online (${AGE_MINUTES}m ago)"
  fi
fi
