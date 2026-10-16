#!/usr/bin/env bash
# نسخ احتياطي لبيانات نادل وجوّ (مجلد data) إلى تخزين خارجي (Cloudflare R2 أو Hetzner Object Storage)
# التشغيل على الخادم كل ٦ ساعات بالـ cron:
#   0 */6 * * *  /opt/nadil/backup.sh >> /var/log/nadil-backup.log 2>&1
# يحتاج rclone مضبوط باسم "offsite":  rclone config  (نوع S3، المزوّد Cloudflare أو Hetzner)
set -euo pipefail
DATA_PATH="${DATA_PATH:-/data/coolify/applications/nadil/data}"   # مسار مجلد data على الخادم (من Coolify ← Storages)
BUCKET="${BUCKET:-offsite:nadil-backups}"
KEEP_LOCAL_DAYS="${KEEP_LOCAL_DAYS:-14}"
LOCAL_DIR="${LOCAL_DIR:-/var/backups/nadil}"
STAMP="$(date -u +%Y-%m-%dT%H%M)"
mkdir -p "$LOCAL_DIR"
FILE="$LOCAL_DIR/nadil-data-$STAMP.tar.gz"
tar -czf "$FILE" -C "$(dirname "$DATA_PATH")" "$(basename "$DATA_PATH")" --exclude='*.tmp'
tar -tzf "$FILE" > /dev/null                      # يتأكد إن الملف سليم
rclone copy "$FILE" "$BUCKET/$(date -u +%Y/%m)/" --s3-no-check-bucket
find "$LOCAL_DIR" -name 'nadil-data-*.tar.gz' -mtime +"$KEEP_LOCAL_DAYS" -delete
echo "$(date -u +%FT%TZ) ok $(du -h "$FILE" | cut -f1) -> $BUCKET"
# الاسترجاع:  rclone copy offsite:nadil-backups/2026/10/nadil-data-XXXX.tar.gz .  ثم  tar -xzf  فوق مجلد data وأعد تشغيل التطبيق
