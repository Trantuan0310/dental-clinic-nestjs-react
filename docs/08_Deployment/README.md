# Deployment Documentation

Hướng dẫn triển khai Dental Clinic Management System lên production.

---

## Mục lục

1. [Environment Variables](./ENVIRONMENT_VARIABLES.md)
2. [Docker Setup](./DOCKER_SETUP.md)
3. [Database Migration](./DATABASE_MIGRATION.md)
4. [Deploy on Railway](./DEPLOY_RAILWAY.md)
5. [Deploy on Render](./DEPLOY_RENDER.md)
6. [Nginx Setup](./NGINX_SETUP.md)
7. [CI/CD](./CI_CD.md)
8. [Health Checks](./HEALTH_CHECKS.md)
9. [Backup Strategy](./BACKUP_STRATEGY.md)

---

## Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────┐
│                    Nginx (Reverse Proxy)                 │
│              port 80/443, SSL termination               │
└───────────────────┬─────────────────────────────────────┘
                    │
         ┌─────────┴──────────┐
         │                    │
    ┌────▼────┐         ┌─────▼────┐
    │ Backend  │         │ Frontend  │
    │ NestJS    │         │ Vite      │
    │ :3000     │         │ :5173     │
    └────┬─────┘         └───────────┘
         │
  ┌──────┴───────┐
  │              │
┌─▼───┐    ┌───▼────┐
│Redis │    │PostgreSQL│
│:6379 │    │  :5432  │
└──────┘    └─────────┘
```

## Checklist triển khai

- [ ] Clone repository
- [ ] Copy `.env.example` → `.env`, điền các giá trị
- [ ] Chạy `docker-compose up -d` (hoặc setup thủ công)
- [ ] Chạy migrations: `npx prisma migrate deploy`
- [ ] Chạy seed: `npx prisma db seed`
- [ ] Build frontend: `npm run build`
- [ ] Deploy backend (Railway/Render/VPS)
- [ ] Deploy frontend (Vercel/Netlify/Railway)
- [ ] Configure SSL
- [ ] Verify health checks
