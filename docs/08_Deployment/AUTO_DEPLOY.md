# Tự động deploy khi merge vào main

Workflow `.github/workflows/deploy.yml`: khi CI trên `main` xanh (lần push / merge), GitHub Actions SSH vào VPS và chạy `scripts/deploy-vps.sh origin/main` (sao lưu DB → checkout → build → migrate → khởi động lại → kiểm tra health). CI đỏ thì không deploy. Mỗi lúc chỉ một lượt deploy.

## Cài đặt một lần

Trên VPS:

1. Khoá cho GitHub Actions đăng nhập: `ssh-keygen -t ed25519 -f ~/gh-deploy -N "" -C github-actions-deploy`, rồi `cat ~/gh-deploy.pub >> ~/.ssh/authorized_keys`.
2. Khoá để VPS đọc repo: `ssh-keygen -t ed25519 -f ~/.ssh/github_repo -N ""`; thêm `~/.ssh/github_repo.pub` vào GitHub → Settings → Deploy keys (chỉ đọc); `~/.ssh/config`:
   ```
   Host github.com
     IdentityFile ~/.ssh/github_repo
   ```
   `cd /opt/dental-clinic/production && git remote set-url origin git@github.com:trantuan0310/dental-clinic-nestjs-react.git && git fetch origin` phải chạy không hỏi gì.

Trên GitHub → Settings → Secrets and variables → Actions:

| Secret | Giá trị |
|---|---|
| `VPS_HOST` | IP hoặc tên miền của VPS |
| `VPS_USER` | user SSH (vd `root`) |
| `VPS_PORT` | cổng SSH (thường `22`) |
| `VPS_SSH_KEY` | nội dung `~/gh-deploy` (khoá bí mật) |

Không dán khoá bí mật vào chat / issue; lỡ lộ thì xoá dòng `github-actions-deploy` trong `~/.ssh/authorized_keys`, tạo khoá mới và cập nhật secret.

## Kiểm tra / chạy tay

GitHub → Actions → **Deploy to VPS** → **Run workflow** (nhánh `main`). Log hiện từng bước của `deploy-vps.sh`; cuối log in bản sao lưu và commit trước đó.

## Khi deploy lỗi

- `tracked files were edited on this server`: trên VPS có file bị sửa tay — `git status`, hoàn tác rồi chạy lại.
- `the postgres service is not running`: khởi động postgres rồi chạy lại.
- SSH `handshake failed` / `unable to authenticate`: kiểm tra `VPS_HOST`, `VPS_PORT`, `VPS_SSH_KEY` (dán đủ từ `-----BEGIN` đến `-----END`) và khoá public có trong `authorized_keys`.
- Rollback: xem `VPS_UPGRADE.md`.

Muốn duyệt tay trước mỗi lần deploy: tạo Environment `production` có "Required reviewers" và thêm `environment: production` vào job.
