# Bàn giao WIP: dark mode và giao diện tiếng Anh

Ngày chốt: 2026-10-13. Dừng phát triển theo yêu cầu người dùng để chuyển sang công việc khác.
Đây là bản lưu tiến độ, **chưa sẵn sàng merge hoặc triển khai**.

## Mốc xuất phát

- Commit trước: `5b29c7b` — sửa responsive và accessibility (47 file).
- Nhánh checkpoint: `work`.
- Kế hoạch chi tiết: [theme-language-plan.md](theme-language-plan.md).
- Đã phân công sáu nhóm sub-agent `gpt-6-luna`; một lượt bị ngắt bởi giới hạn sử dụng,
  sau đó tiếp tục theo từng nhóm file. Không có sub-agent còn chạy khi chốt.

## Đã triển khai nhưng chưa nghiệm thu toàn bộ

- Thêm sáu bộ từ điển Việt/Anh: uiCommon, uiClinical, uiEntry, uiOperations,
  uiScheduling, uiWorkforce; đăng ký vào i18next.
- Dịch component dùng chung: phân trang, bảng, trạng thái, loading, menu,
  breadcrumb, nhãn bắt buộc, thông báo thiếu quyền, command palette.
- Sửa đồng bộ ngôn ngữ, chuẩn hóa mã vùng en-US, khôi phục theme lưu trước đó,
  nhãn chuyển theme theo chế độ thực tế; helper định dạng theo ngôn ngữ hiện tại,
  giữ tiền VND và múi giờ phòng khám.
- Thêm màu brand-300 bị thiếu; cải thiện tương phản nút chính, màu nền/chữ tối,
  thanh tab cuộn trong vùng chứa khi nhãn dài.
- Áp dụng bản dịch ở dashboard/đăng nhập/trang công khai/tài khoản; bệnh nhân và
  các tab hồ sơ khám; lịch hẹn/đặt lịch; hóa đơn/kho/chi phí/báo cáo;
  nhân viên/người dùng/dịch vụ và một phần bảng lương/ca làm việc.
- Tên bệnh nhân, dịch vụ và nội dung do người dùng/server cung cấp vẫn giữ nguyên.
- Thêm fallback lỗi có bản dịch và helper nhãn vai trò `getRoleLabel`.

## Kiểm tra và trạng thái chính xác

### Kiểm tra đã chạy đạt trước lúc chốt

`node scripts/check-preferences.mjs`: đổi VI/EN trực tiếp, lưu lựa chọn qua reload,
độc lập giữa theme và locale, theo màu hệ điều hành, mã vùng en-US và formatter.
Các sub-agent đã chạy ESLint theo phạm vi tại thời điểm từng phần hoàn thành.
Chưa được coi các kết quả này là nghiệm thu bản tích hợp cuối cùng.

### Kiểm tra lại tại thời điểm bàn giao

- `npx tsc -b` **FAIL**:
  `src/features/staff/EmployeesPage.tsx(592,30): Cannot find name 'ACCOUNT_STATUS_HINT'.`
- `node scripts/check-ui-locales.mjs` **FAIL**, dừng ở khóa đầu tiên thiếu:
  `uiScheduling.overdueNotArrived` trong AppointmentCalendarPage.
  Cần sửa rồi chạy tiếp để liệt kê các khóa thiếu tiếp theo.
- `git diff --check` **FAIL**: các dòng CRLF mới bị báo trailing whitespace,
  ví dụ Breadcrumb.tsx, SearchInput.tsx, ThemeToggle.tsx, ExpenseListPage.tsx.
- Chưa chạy lại production build/lint toàn bộ sau bản tích hợp cuối.
- Chưa kiểm tra nghiệp vụ với backend thật; các browser scripts dùng API fixtures.

### Ma trận trình duyệt đã lưu

[theme-language-audit-checkpoint.json](theme-language-audit-checkpoint.json)
chứa 168 trường hợp (21 route × VI/EN × light/dark × 375/1440px), 52 trường hợp
có ít nhất một finding. Đây là ảnh chụp tiến độ khi các agent đang làm, có thể
không phản ánh chính xác các chỉnh sửa cuối. Phải chạy lại để xác nhận.
52 là số trường hợp, không phải 52 lỗi độc lập.

Các vấn đề đáng chú ý trong snapshot EN/dark/375px:

- Landing: khẩu hiệu và giờ làm việc còn tiếng Việt; phân biệt nội dung cấu hình
  phòng khám với nhãn giao diện trước khi dịch.
- Booking: câu thời gian báo trước bị ghép trùng tiếng Việt (`2 hours ... 2 giờ`).
- Patient detail: tràn ngang, các nút/tuổi/giới tính/ngày còn tiếng Việt;
  lộ khóa `uiClinical.encounterHistory`.
- Encounter: thời lượng khám và thẻ tiền sử/dị ứng còn tiếng Việt.
- Appointments: lộ khóa `uiScheduling.overdueNotArrived` và `uiScheduling.over15Minutes`.
- Appointment list: còn câu `Hiển thị 0 / 0 lịch hẹn`.
- Schedule: nội dung các tab và nút thao tác còn tiếng Việt.
- Login/dashboard/patient form/inventory/invoices/reports/expenses/staff/users/
  payroll/services/account không có finding ở tổ hợp mẫu EN/dark/375px đó;
  điều này không bảo đảm mọi dialog và trạng thái của các route đều hoàn thiện.

## Thứ tự tiếp tục

1. Sửa symbol ACCOUNT_STATUS_HINT bằng nhãn trạng thái phản ứng theo locale;
   giữ nguyên enum/payload API. Rà chỗ dùng NAV_ROLE_HINT trong UsersPage nếu còn.
2. Chạy check-ui-locales, sửa toàn bộ khóa thiếu/trùng, kiểm tra cặp VI/EN và
   biến nội suy. Rà các chuỗi ghép có cả hai ngôn ngữ.
3. Hoàn thiện patient detail/history, appointment dialogs/calendar subviews,
   schedule tab contents, booking request console và các màn hình payroll/admin
   sâu hơn. Không suy diễn rằng dịch header đồng nghĩa cả luồng đã được dịch.
4. Xử lý tràn ngang patient detail, kiểm tra modal/tab và chữ dài bằng ảnh chụp.
5. Chuẩn hóa phần whitespace đã thay đổi, chạy build + scoped ESLint.
6. Chạy lại toàn bộ ma trận bằng Chromium, xem ảnh thực tế và sửa findings.
   Kiểm tra validation khi đang hiển thị lỗi mà chuyển ngôn ngữ.
7. Chạy các regression scripts cũ, sau đó kiểm thử với backend thật khi có.

## Lệnh kiểm tra

Từ thư mục frontend, chạy Vite ở một terminal: `npm run dev`.
Terminal khác:

```sh
npx tsc -b
npm run build
node scripts/check-ui-locales.mjs
node scripts/check-preferences.mjs
AUDIT_ONLY=1 node scripts/check-theme-language.mjs
# Chế độ mặc định sẽ fail nếu còn finding:
node scripts/check-theme-language.mjs
node scripts/check-ui-polish.mjs
node scripts/check-table-ui.mjs
node scripts/check-booking-race.mjs
node scripts/check-clinical-ui.mjs
```

Browser scripts hỗ trợ `PLAYWRIGHT_BASE_URL` và `CHROMIUM_PATH`.
`check-theme-language.mjs` hỗ trợ `ONLY=login,patient-form,...` để kiểm tra có mục tiêu.
Ảnh cục bộ nằm ở `frontend/artifacts/theme-language/` (gitignore, không được push).
Bản JSON audit được sao chép vào docs ở checkpoint này để giữ bằng chứng trên GitHub.
Không đổi assertions sang bỏ qua lỗi chỉ để làm bộ kiểm tra đạt.
