# Backup Strategy

Chiến lược backup database và restore.

---

## PostgreSQL Backup

### Automated Daily Backup (cron)

```bash
# /etc/cron.daily/postgres-backup
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/postgres"
RETENTION_DAYS=30

# Create backup
pg_dump -h localhost -U clinic_user -d dental_clinic -F c -f "$BACKUP_DIR/backup_$DATE.dump"

# Compress
gzip "$BACKUP_DIR/backup_$DATE.dump"

# Remove old backups
find "$BACKUP_DIR" -name "backup_*.dump.gz" -mtime +$RETENTION_DAYS -delete

# Upload to S3 (optional)
# aws s3 cp "$BACKUP_DIR/backup_$DATE.dump.gz" s3://your-bucket/postgres/
```

### Chmod và enable

```bash
sudo chmod +x /etc/cron.daily/postgres-backup
```

---

## Backup Types

| Type | Schedule | Retention | Description |
|------|----------|-----------|-------------|
| Full | Daily 2:00 AM | 30 days | Toàn bộ database |
| Weekly | Sunday 2:00 AM | 12 weeks | Backup trước weekly maintenance |
| Monthly | 1st of month | 12 months | Backup trước monthly review |

---

## Restore from Backup

### Full restore

```bash
# Stop app
sudo systemctl stop dental-clinic-backend

# Drop và recreate database
psql -h localhost -U clinic_user -d postgres -c "DROP DATABASE dental_clinic;"
psql -h localhost -U clinic_user -d postgres -c "CREATE DATABASE dental_clinic;"

# Restore
pg_restore -h localhost -U clinic_user -d dental_clinic -c backup_file.dump

# Start app
sudo systemctl start dental-clinic-backend
```

### Point-in-time recovery (PITR)

```bash
# Enable WAL archiving (postgresql.conf)
wal_level = replica
max_wal_senders = 3
archive_mode = on
archive_command = 'cp %p /var/lib/postgresql/wal_archive/%f'

# Restore to specific timestamp
pg_restore -h localhost -U clinic_user -d dental_clinic \
  --target-timestamp "2026-08-01 12:00:00+07" \
  backup_file.dump
```

---

## Off-site Backup

### S3 (AWS / MinIO)

```bash
# Upload with AWS CLI
aws s3 cp backup_20260803.dump.gz s3://your-bucket/postgres/

# Upload with rclone
rclone copy backup_20260803.dump.gz remote:backups/postgres/
```

### rclone config

```bash
# /etc/rclone.conf
[remote]
type = s3
provider = AWS
access_key_id = YOUR_KEY
secret_access_key = YOUR_SECRET
region = ap-southeast-1
bucket = your-bucket
```

---

## Restore Testing

**Quan trọng**: Test restore quarterly.

```bash
# 1. Create test database
psql -h localhost -U clinic_user -d postgres -c "CREATE DATABASE dental_clinic_test_restore;"

# 2. Restore to test DB
pg_restore -h localhost -U clinic_user -d dental_clinic_test_restore -c backup_file.dump

# 3. Verify data
psql -h localhost -U clinic_user -d dental_clinic_test_restore -c "SELECT COUNT(*) FROM users;"

# 4. Cleanup
psql -h localhost -U clinic_user -d postgres -c "DROP DATABASE dental_clinic_test_restore;"
```

---

## Disaster Recovery Checklist

- [ ] Backup được tạo thành công mỗi ngày
- [ ] Backup có thể restore thành công
- [ ] Backup được upload lên off-site storage
- [ ] DR documentation được cập nhật
- [ ] Team biết cách restore
- [ ] RTO (Recovery Time Objective): 4 giờ
- [ ] RPO (Recovery Point Objective): 24 giờ
