# CI/CD Pipeline

GitHub Actions workflow cho automated testing và deployment.

---

## `.github/workflows/ci.yml`

```yaml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'

jobs:
  lint-and-test-backend:
    name: Backend — Lint & Test
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: dental_clinic_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma Client
        run: npx prisma generate
        env:
          DATABASE_URL: postgresql://test_user:test_password@localhost:5432/dental_clinic_test

      - name: Run migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test_user:test_password@localhost:5432/dental_clinic_test

      - name: Run ESLint
        run: npm run lint

      - name: Run tests
        run: npm test -- --coverage
        env:
          DATABASE_URL: postgresql://test_user:test_password@localhost:5432/dental_clinic_test
          JWT_SECRET: test-jwt-secret-for-ci-minimum-32-chars
          JWT_REFRESH_SECRET: test-refresh-secret-for-ci-minimum-32

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./backend/coverage/lcov.info
          fail_ci_if_error: false

  lint-and-test-frontend:
    name: Frontend — Lint & Test
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: TypeScript check
        run: npx tsc --noEmit

      - name: Build
        run: npm run build
        env:
          VITE_API_BASE_URL: http://localhost:3000/api/v1

  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: [lint-and-test-backend, lint-and-test-frontend]
    defaults:
      run:
        working-directory: frontend

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: dental_clinic_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Start backend
        run: |
          cd ../backend
          npm ci
          npx prisma generate
          npx prisma migrate deploy
          npx prisma db seed
          npm run start:prod &
        env:
          DATABASE_URL: postgresql://test_user:test_password@localhost:5432/dental_clinic_test
          JWT_SECRET: test-jwt-secret-for-e2e-minimum-32-chars
          JWT_REFRESH_SECRET: test-refresh-secret-for-e2e-minimum-32

      - name: Start frontend dev server
        run: npm run dev &
        env:
          VITE_API_BASE_URL: http://localhost:3000/api/v1

      - name: Run Playwright tests
        run: npx playwright test
        env:
          PLAYWRIGHT_BASE_URL: http://localhost:5173

  deploy:
    name: Deploy to Railway
    runs-on: ubuntu-latest
    needs: e2e-tests
    if: github.ref == 'refs/heads/main'
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Railway
        uses: railway-deploy-action@v1
        with:
          token: ${{ secrets.RAILWAY_TOKEN }}
          project: ${{ secrets.RAILWAY_PROJECT_ID }}
          service: backend
          directory: backend
```

---

## Secrets cần thiết

Trong GitHub repo → Settings → Secrets:

| Secret | Mô tả |
|--------|--------|
| `RAILWAY_TOKEN` | Railway API token |
| `RAILWAY_PROJECT_ID` | Railway project ID |

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
