# CI/CD Pipeline

GitHub Actions workflow cho automated linting/typecheck/test/build.

> **Không có auto-deploy.** `.github/workflows/ci.yml` chỉ chạy kiểm tra và
> build — không có job nào deploy tới Railway, Render, hay bất kỳ môi trường
> nào. Một phiên bản trước của tài liệu này mô tả một job `deploy` tự động
> push lên Railway khi merge vào `main`; job đó **chưa từng được implement**
> trong workflow thật, tài liệu mô tả sai. Muốn deploy, làm theo hướng dẫn
> thủ công/GitHub-integration trong [DEPLOY_RAILWAY.md](./DEPLOY_RAILWAY.md)
> hoặc [DEPLOY_RENDER.md](./DEPLOY_RENDER.md) — cả hai đều dùng cơ chế
> auto-deploy-on-push riêng của nền tảng đó (cấu hình phía Railway/Render),
> không phải qua GitHub Actions.

---

## `.github/workflows/ci.yml` (nội dung thật)

Trigger: `push`/`pull_request` vào `main`. 6 job độc lập, không job nào chạm
database hay bất kỳ credential nào — an toàn chạy trên mọi PR kể cả từ fork.

| Job | Làm gì |
|---|---|
| `backend-lint` | `npm run lint` (ESLint) trong `backend/` |
| `backend-typecheck` | `prisma generate` rồi `tsc --noEmit` |
| `backend-test` | `prisma generate` rồi `npm run test` (unit test, dùng Prisma mock — không cần Postgres thật) |
| `backend-build` | `npm run build`, upload `backend/dist` làm artifact (7 ngày), phụ thuộc 3 job trên |
| `frontend-lint` | `npm run lint` trong `frontend/` |
| `frontend-typecheck` | `npm run typecheck` |
| `frontend-build` | `npm run build`, upload `frontend/dist` làm artifact, phụ thuộc 2 job lint/typecheck |

Không có `services: postgres`, không cần `DATABASE_URL`/`JWT_SECRET` trong
CI — vì unit test dùng Prisma mock (`test/helpers/prisma-mock.ts`), không kết
nối DB thật. Không có e2e/Playwright job trong CI hiện tại (setup e2e tồn
tại ở `frontend/e2e/`, nhưng cần Docker/Postgres nên chưa wire vào workflow).

Xem file gốc: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

---

## Muốn thêm auto-deploy thật sự?

Cần làm thêm (chưa có sẵn, đây là việc cần làm nếu muốn tự động hóa):

1. Chọn nền tảng (Railway/Render) và tạo project theo [DEPLOY_RAILWAY.md](./DEPLOY_RAILWAY.md) / [DEPLOY_RENDER.md](./DEPLOY_RENDER.md).
2. Cách đơn giản nhất: bật GitHub-integration auto-deploy ngay trên dashboard
   của Railway/Render — không cần sửa `ci.yml` gì cả, nền tảng tự deploy khi
   có push mới vào `main`.
3. Nếu muốn deploy chạy *sau khi* CI xanh (thay vì độc lập): thêm job mới
   vào `ci.yml`, `needs: [backend-build, frontend-build]`,
   `if: github.ref == 'refs/heads/main'`, gọi CLI/action của nền tảng đã
   chọn, và thêm token tương ứng vào GitHub repo → Settings → Secrets.
4. Trước khi bật bất kỳ auto-deploy nào: xem lại phần "Security Notes" ở
   [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) và đổi mật khẩu
   tài khoản admin mặc định do `prisma/seed.ts` tạo ra.

---

## Git Hooks (Optional)

Thêm pre-commit hook để chạy lint trước khi commit:

```bash
# backend/package.json
{
  "scripts": {
    "prepare": "husky install"
  }
}
```

```bash
# .husky/pre-commit
npm run lint
npm test
```
