# Nginx Setup

Cấu hình Nginx reverse proxy với SSL.

---

## Server Requirements

- Ubuntu 22.04 LTS
- Domain trỏ về server IP
- Certbot cho SSL certificate

---

## Installation

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
```

---

## Nginx Config — `/etc/nginx/sites-available/dental-clinic`

```nginx
upstream backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Certificate (Certbot)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/vnd.ms-fontobject font/opentype;

    # Frontend static files
    root /var/www/dental-clinic/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check endpoint
    location /health {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }

    # Security
    location ~ /\. {
        deny all;
    }
}
```

---

## Deployment Steps

```bash
# 1. Copy frontend build
sudo rm -rf /var/www/dental-clinic/frontend
sudo mkdir -p /var/www/dental-clinic/frontend
sudo cp -r /path/to/frontend/dist /var/www/dental-clinic/frontend/

# 2. Enable site
sudo ln -s /etc/nginx/sites-available/dental-clinic /etc/nginx/sites-enabled/

# 3. Test config
sudo nginx -t

# 4. Reload nginx
sudo systemctl reload nginx

# 5. Setup SSL
sudo certbot --nginx -d your-domain.com
```

---

## Auto-renew SSL

```bash
# Certbot tự động renew. Verify:
sudo certbot renew --dry-run
```

---

## Troubleshooting

### 502 Bad Gateway

Backend chưa chạy:
```bash
sudo systemctl status nestjs-backend
sudo journalctl -u nestjs-backend -f
```

### SSL Error

```bash
sudo certbot certificates
sudo certbot renew
```
