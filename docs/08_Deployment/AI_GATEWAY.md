# Kết nối AI (tóm tắt hồ sơ bệnh nhân)

Thẻ **AI tóm tắt** trên Dashboard và màn tiếp đón tóm tắt 3 ý cho mỗi bệnh nhân: dị ứng, việc còn dở và việc cho lần tới. Hệ thống chọn nguồn AI theo thứ tự:

1. **Gateway AI** (xkiro, OpenRouter, proxy riêng…): dùng khi có `AI_BASE_URL`.
2. **Google Gemini:** dùng khi có `GEMINI_API_KEY` và không có gateway.
3. **Quy tắc có sẵn:** dùng khi không cấu hình AI nào, hoặc khi AI lỗi hay quá 20 giây không trả lời. Thẻ tóm tắt vẫn hiển thị, chỉ đơn giản hơn.

Dòng "Nguồn" ở cuối thẻ cho biết đang dùng nguồn nào và model nào.

## Dùng gateway (ví dụ xkiro)

Trên trang quản lý của gateway, lấy ba thông tin:

| Thông tin | Ví dụ | Ghi chú |
|---|---|---|
| Base URL | `https://api.xkiro.com/v1` | Địa chỉ API, thường kết thúc bằng `/v1` |
| API key | `sk-...` | Giữ bí mật; chỉ đặt trong `.env.production` trên VPS |
| Tên model | `claude-sonnet-...`, `gpt-...` | Chính xác như gateway liệt kê |

Kiểm tra tài liệu của gateway xem API tương thích **OpenAI** (đường dẫn `/v1/chat/completions`, header `Authorization: Bearer`) hay **Anthropic** (`/v1/messages`, header `x-api-key`). Phần lớn gateway dùng kiểu OpenAI.

Thêm vào `/opt/dental-clinic/production/.env.production`:

```sh
AI_BASE_URL=https://api.xkiro.com/v1
AI_API_KEY=sk-...
AI_MODEL=ten-model-cua-gateway
AI_API_FORMAT=openai        # hoặc anthropic
```

Khởi động lại backend:

```sh
cd /opt/dental-clinic/production
docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend
docker compose --env-file .env.production -f docker-compose.prod.yml logs backend | grep "AI summary"
# mong đợi: AI summary uses openai gateway model <tên model>
```

Kiểm tra: mở hồ sơ một bệnh nhân có lịch sử khám, bấm làm mới thẻ **AI tóm tắt**, dòng "Nguồn" phải hiện `AI (<tên model>)`.

- Nếu vẫn hiện "Quy tắc có sẵn", xem log: `docker compose ... logs backend | grep "AI model failed"`.
  - `AI gateway 401`: sai key.
  - `AI gateway 404`: sai base URL hoặc sai kiểu API.
  - `AI gateway 400`: thường do sai tên model.
- Key không bao giờ bị in ra log.

## Lưu ý dữ liệu

Khi bật AI, bản tóm tắt được tạo từ dị ứng, bệnh nền, thuốc đang dùng, các lần khám gần đây (chẩn đoán, điều trị, kế hoạch) và số phiên khám hay hóa đơn còn mở của bệnh nhân. Những dữ liệu này được gửi tới nhà cung cấp AI. Họ tên, số điện thoại, ngày sinh và địa chỉ **không** được gửi. Hãy chọn gateway đáng tin cậy và kiểm tra điều khoản lưu trữ dữ liệu của họ. Kết quả được lưu đệm 1 giờ cho mỗi bệnh nhân.
