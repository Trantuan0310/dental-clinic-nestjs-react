# GLOSSARY — Thuật ngữ nghiệp vụ

> **Glossary là nơi "AI đọc cùng ngôn ngữ với dự án".** Mỗi thuật ngữ có MỘT định nghĩa duy nhất. Nếu lập trình viên, BA, hay AI dùng sai → dẫn chiếu về đây.
>
> Quy ước: Tiếng Việt có kèm Tiếng Anh trong ngoặc để thống nhất khi giao tiếp kỹ thuật.

---

## A — Actors (Vai trò)

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **Quản trị viên phòng khám** | Clinic Administrator | Người sở hữu phòng khám hoặc được ủy quyền. Có toàn quyền quản lý người dùng, settings, xem báo cáo tài chính. |
| **Lễ tân** | Receptionist | Người tiếp đón bệnh nhân, đặt lịch, check-in, thu tiền. Không có quyền ghi hồ sơ y tế. |
| **Bác sĩ / Nha sĩ** | Dentist | Người khám và điều trị. Có quyền tạo và sửa hồ sơ y tế cho lượt khám do mình phụ trách. |
| **Bệnh nhân** | Patient | Người được khám/điều trị. **KHÔNG phải User hệ thống** (xem ADR-0003). |

---

## B — Actor-bound Resources

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **User** | User | Tài khoản trong hệ thống (admin/receptionist/dentist). Có password, role, permission. KHÔNG bao gồm patient. |
| **Role** | Role | Tập hợp permission gán cho User. Trong MVP có 3 role: `clinic_admin`, `receptionist`, `dentist`. Có thể cấu hình thêm. |
| **Permission** | Permission | Hành động cụ thể được phép thực hiện trên tài nguyên. Format `<resource>.<action>` (VD: `appointment.create`). Xem đầy đủ ở `docs/01_Architecture/actor-permissions-matrix.md`. |
| **FIFO** | First In First Out | Nguyên tắc hàng đợi: người đến trước được phục vụ trước. Waiting queue của MVP theo FIFO (xem BD-0001). |
| **Row-level filter** | Row-Level Security (RLS) | Cơ chế giới hạn user chỉ thấy record "của mình" trong cùng permission. VD: dentist chỉ xem encounter mình tạo. |

---

## C — Core Clinical Concepts

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **Bệnh nhân** | Patient | Thực thể cốt lõi. Một Patient có thể có nhiều lịch hẹn, nhiều lượt khám, nhiều hóa đơn trong nhiều năm. |
| **Lịch hẹn** | Appointment | Một khoảng thời gian dự kiến bệnh nhân sẽ đến khám với một bác sĩ, ở một phòng/kháms. Có thể có `status`. |
| **Check-in** | Check-in | Hành động lễ tân xác nhận bệnh nhân đã đến. Chuyển Appointment từ `scheduled` → `checked_in`. |
| **Hàng đợi** | Waiting Queue | Danh sách bệnh nhân đang chờ khám, sắp xếp theo thời điểm check-in và mức độ ưu tiên. |
| **Lượt khám** | Encounter (Visit) | Một phiên khám **thực sự** diễn ra (sau check-in). Có thể có nhiều encounter cho cùng một appointment (trường hợp đặc biệt). |
| **Hồ sơ y tế** | Medical Record | Tập hợp encounter, điều trị, toa thuốc, ghi chú lâm sàng của bệnh nhân — theo thời gian. |
| **Biểu đồ nha khoa** | Dental Chart | Sơ đồ răng (32 hoặc 28 răng người lớn + 20 răng sữa ở trẻ em) ghi chép tình trạng từng răng theo thời gian. |
| **Điều trị** | Treatment | Hành động y tế được thực hiện trong một encounter (VD: nhổ răng, hàn răng, tẩy trắng). |
| **Toa thuốc** | Prescription | Danh sách thuốc bác sĩ kê cho bệnh nhân sau một encounter. |
| **Ghi chú** | Clinical Note | Ghi chú lâm sàng của bác sĩ trong quá trình khám. Bao gồm chẩn đoán, chỉ định, nhận xét. |

---

## D — Operational Concepts

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **Hóa đơn** | Invoice | Phiếu tính tiền cho dịch vụ/điều trị đã thực hiện. Có nhiều `InvoiceItem`. |
| **Khoản mục hóa đơn** | Invoice Item | Một dòng trong hóa đơn — tương ứng 1 treatment hoặc 1 service. |
| **Thanh toán** | Payment | Ghi nhận bệnh nhân đã trả tiền cho hóa đơn. Một hóa đơn có thể có nhiều payment (trả góp). |
| **Công nợ** | Outstanding Balance | Số tiền còn lại chưa thanh toán = tổng invoice - tổng payment. |
| **Phương thức thanh toán** | Payment Method | Tiền mặt, chuyển khoản, thẻ, ví điện tử — cấu hình trong settings. |
| **Vật tư** | Inventory Item | Vật tư nha khoa (găng tay, composite, thuốc tê) có số lượng tồn kho. |
| **Nhập/Xuất kho** | Stock Movement | Ghi nhận biến động kho: nhập từ nhà cung cấp, xuất khi dùng, điều chỉnh kiểm kê. |
| **Cài đặt phòng khám** | Clinic Settings | Cấu hình chung: tên phòng khám, địa chỉ, thuế suất, danh sách dịch vụ, payment methods. |
| **Bảng giá dịch vụ** | Service Catalog | Danh sách dịch vụ nha khoa + đơn giá. Một service tương ứng một invoice item phổ biến. |

---

## E — Status Definitions

### Appointment Status

| Status | Tiếng Việt | Định nghĩa |
| ------ | ---------- | ---------- |
| `scheduled` | Đã đặt lịch | Lịch hẹn được tạo, bệnh nhân chưa đến. |
| `confirmed` | Đã xác nhận | Bệnh nhân hoặc lễ tân đã xác nhận (qua điện thoại/email). |
| `checked_in` | Đã check-in | Bệnh nhân đã đến phòng khám, đang chờ. |
| `in_progress` | Đang khám | Encounter bắt đầu. |
| `completed` | Hoàn tất | Encounter kết thúc. |
| `cancelled` | Đã hủy | Lịch bị hủy trước khi khám. |
| `no_show` | Không đến | Bệnh nhân không đến mà không hủy. |

### Invoice Status

| Status | Tiếng Việt | Định nghĩa |
| ------ | ---------- | ---------- |
| `draft` | Nháp | Lễ tân/BS đang tạo, chưa xuất. |
| `issued` | Đã xuất | Hóa đơn đã gửi cho bệnh nhân, chờ thanh toán. |
| `partial` | Thanh toán một phần | Đã nhận một phần, còn công nợ. |
| `paid` | Đã thanh toán | Tổng payment = tổng hóa đơn. |
| `cancelled` | Đã hủy | Hủy hóa đơn (kèm lý do, audit). |
| `refunded` | Đã hoàn tiền | Đã trả lại tiền. |

---

## F — Time & Workflow

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **Slot thời gian** | Time Slot | Khoảng thời gian (thường 30 phút) trong lịch làm việc của bác sĩ. |
| **Lịch làm việc** | Working Schedule | Khung giờ bác sĩ nhận khám, có thể khác nhau theo ngày/tuần. |
| **Lịch sử chỉnh sửa** | Audit Trail | Log mọi thay đổi: ai, khi nào, thay đổi gì. |
| **Phiên làm việc** | Session | Khoảng thời gian user đăng nhập đến khi logout/timeout. |
| **Cổng thông tin bệnh nhân** | Patient Portal | (Sau MVP) Website/app cho bệnh nhân xem lịch, hồ sơ cơ bản — nếu có. |

---

## G — Các khái niệm KHÔNG dùng (để tránh nhầm)

| Thuật ngữ | Vì sao tránh |
| --------- | ------------ |
| "Cuộc hẹn" — dùng cho Check-in | Dễ nhầm "Appointment". Appointment chỉ cho lịch hẹn trước, Check-in là hành động. |
| "Khám bệnh" — chỉ để nói về Encounter | Có thể hiểu nhầm với cả appointment hay visit. Encounter là phiên khám *thực sự*. |
| "Bệnh nhân đăng nhập" | Patient không đăng nhập. Có cổng riêng? → Patient Account (sau MVP). |
| "Xóa bệnh nhân" | Chỉ xóa mềm. "Xóa" trong nghĩa y tế thường là ẩn/ngừng dùng. |
| "Người dùng cuối" | Tên khác: end-user. Tránh dùng vì thường hiểu nhầm là Patient. |

---

## I — Thuật ngữ bổ sung (Addendum — cập nhật sau Giai đoạn 3)

> Phần này dùng để mở rộng glossary mà không phá cấu trúc A→H. Khi có thuật ngữ mới từ BA/đối tác, thêm vào đây (sau này có thể tái cấu trúc).

### Làm việc theo ca

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **Lịch làm việc** | Working Schedule | Khung giờ cố định mà bác sĩ nhận khám trong tuần. Cấu hình per dentist. |
| **Slot thời gian** | Time Slot | Khoảng thời gian đặt lịch (mặc định 30 phút). Mỗi slot chứa 0 hoặc 1 Appointment. |
| **Ca khám** | Shift (Ca) | Cụm nhiều slot liên tục (vd: sáng 8h–12h, chiều 13h–17h). |
| **Ngoài giờ** | Out-of-hours | Thời gian ngoài working schedule. Hệ thống không cho đặt lịch trừ khi BS tự mở ca đặc biệt. |
| **Xác nhận lịch** | Confirmation | Lễ tân hoặc BN xác nhận đã nhận thông tin lịch hẹn. Trạng thái `confirmed` (tuỳ chọn). |

### Tồn kho (BD-0004)

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **Vật tư nha khoa** | Inventory Item | Sản phẩm tiêu hao trong phòng khám (composite, thuốc tê, găng tay). Có `quantity_on_hand`. |
| **Nhập kho** | Stock In | Ghi nhận tăng số lượng khi nhà cung cấp giao hàng. |
| **Xuất kho** | Stock Out | Ghi nhận giảm số lượng khi BS dùng (trong treatment). Trong MVP: tự động khi Encounter sinh Treatment có vật tư. |
| **Kiểm kê** | Stock Adjustment | Điều chỉnh tay khi kiểm kê thực tế ≠ hệ thống. Kèm lý do + actor. |
| **Ngưỡng cảnh báo** | Reorder Threshold | Khi `quantity_on_hand < threshold` → cảnh báo admin. |

### Lâm sàng (BD-0005)

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **Sơ đồ răng** | Dental Chart | Bản đồ tình trạng từng răng (người lớn 32 răng, trẻ em 20 răng sữa). Mỗi răng có `status` (healthy/caries/filled/missing/crowned/...). Lưu theo thời gian, không ghi đè. |
| **Phiếu điều trị** | Treatment Record | Ghi nhận thao tác trong 1 encounter: răng nào, thao tác gì, ghi chú. Một Treatment có thể cover 1 hoặc nhiều răng. |
| **Ghi chú lâm sàng** | Clinical Note | Văn bản tự do của bác sĩ: chẩn đoán, chỉ định, nhận xét. Mỗi Encounter có 0 hoặc 1 Clinical Note. |
| **Toa thuốc** | Prescription | Danh sách thuốc kèm liều dùng. Mỗi Encounter có 0 hoặc 1 Prescription, gồm nhiều PrescriptionLine. |
| **Liệu trình điều trị** | Treatment Plan | Chuỗi Encounter + Appointment để hoàn tất 1 case (niềng, implant). **Không ở MVP** — mở rộng sau. |
| **Răng sữa** | Primary Teeth | Răng trẻ em, ký hiệu A–T (Palmer) hoặc 51–85 (ISO). |
| **Ký hiệu Palmer** | Palmer Notation | Chuẩn ký hiệu răng: 1–8 (Quadrant I–IV). Hệ thống MVP chấp nhận đầu vào tự do, tự động phát hiện chuẩn. |

### Hủy & no-show

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **Hủy lịch** | Cancellation | Lễ tân / BS chuyển Appointment từ `scheduled`/`confirmed` → `cancelled`. Bắt buộc có `reason`. |
| **Không đến** | No-show | BN không đến sau giờ hẹn + grace period (default 15 phút). |
| **BN thường xuyên no-show** | Frequent No-show Patient | BN có ≥ 3 no-show trong 6 tháng. Cảnh báo khi đặt lịch. |

### Authentication & Identity

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **Đăng nhập** | Login / Sign-in | User gửi email + password; hệ thống xác minh và cấp session. |
| **Đăng xuất** | Logout / Sign-out | Kết thúc 1 session hiện tại (hoặc tất cả session của user). |
| **Access Token** | Access Token | JWT ngắn hạn (TTL 15 phút), dùng cho mọi API call. Lưu **memory** ở frontend. |
| **Refresh Token** | Refresh Token | Token dài hạn (TTL 7 ngày), lưu DB (hash) + cookie httpOnly ở frontend. Dùng để xin access token mới. |
| **Rotation (refresh token)** | Refresh Token Rotation | Mỗi lần refresh sinh token mới, token cũ bị revoke. Chống replay attack. |
| **Reuse detection** | Refresh Reuse Detection | Nếu token đã revoke bị dùng lại → thu hồi TẤT CẢ session của user. |
| **Password hashing** | Password Hashing | Lưu password dạng hash bằng **argon2id** (không lưu plaintext). Cost tối thiểu theo OWASP. |
| **Lockout** | Account Lockout | Khoá tài khoản tạm thời sau N lần sai password (5 lần / 15 phút ở MVP). |
| **Forgot password** | Forgot Password | User yêu cầu reset qua email. Hệ thống sinh reset token (UUID v7, TTL 1h). |
| **Reset token** | Password Reset Token | Token 1 lần, dùng để xác minh quyền đổi password. Hash khi lưu DB. |
| **Audit log** | Audit Log | Bảng ghi log các hành động nhạy cảm (login, đổi password, đổi role...). Không thể sửa/xóa qua API. |
| **System role** | System Role | Role không thể xóa khỏi DB (`clinic_admin`, `receptionist`, `dentist`). |
| **System permission** | System Permission | Permission không thể xóa, được seed qua migration. |
| **Last admin guard** | Last Admin Guard | Logic ngăn hành động khiến user có role `clinic_admin` cuối cùng bị mất role. |
| **Pending setup** | Pending Setup | User mới tạo, password tạm thời, phải đổi trước khi dùng bình thường. |
| **Deactivated user** | Deactivated User | User đã bị admin vô hiệu hoá. `deactivated_at != null`. Vẫn còn trong DB (soft delete), không thể login. |
| **bcrypt** | bcrypt | _(KHÔNG dùng)_ Dự án MVP dùng **argon2id**, không dùng bcrypt. |
| **LocalStorage cho token** | localStorage for tokens | _(KHÔNG dùng)_ Token không lưu localStorage vì rò rỉ XSS. Chỉ memory + cookie httpOnly. |

### Patients

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **Mã bệnh nhân** | Patient Code | Mã thân thiện format `PAT-YYYY-NNNNN` (xem BD-0006). Unique, immutable. Dùng để in phiếu, tra cứu nhanh. |
| **Tra cứu bệnh nhân** | Patient Lookup | API `GET /patients/lookup` hỗ trợ gợi ý duplicate khi tạo BN mới. Ưu tiên: phone > cccd > name+dob > name. |
| **Trùng bệnh nhân** | Duplicate Patient | 2+ BN thực chất là 1 người. Hệ thống gợi ý qua lookup, admin gộp qua merge. |
| **Gộp bệnh nhân** | Patient Merge | Hành động gộp 2 BN (source → target). Source soft-delete, FK encounter/invoice/etc migrate sang target. |
| **Lịch sử SĐT** | Phone History | Bảng `patient_phone_histories` — lưu mỗi lần đổi SĐT (audit, không ghi đè). |
| **CCCD/CMND** | National ID | Số CMND 9 chữ số hoặc CCCD 12 chữ số. Optional ở MVP, unique per type per active patient. |
| **Dị ứng** | Allergies | Danh sách dị ứng của BN (vd: Penicillin, latex). Lưu dạng `string[]` ở MVP. |
| **Bệnh nền** | Chronic Diseases | Bệnh mãn tính BN đang mắc (vd: hypertension, diabetes). `string[]`. |
| **Thuốc đang dùng** | Current Medications | Thuốc BN đang dùng thường xuyên (không phải toa). `string[]`. |
| **Liên hệ khẩn cấp** | Contact Person | Người liên hệ khi cần — bắt buộc cho BN < 12 tuổi. |
| **Trẻ em / vị thành niên** | Minor | BN dưới 18 tuổi (theo luật VN). < 12 tuổi: yêu cầu contactPerson. |
| **Soft-delete (BN)** | Soft-Deleted Patient | BN bị set `deleted_at`. Vẫn còn trong DB, không cho tạo appointment/invoice mới, có thể restore. |
| **Restore** | Restore | Admin khôi phục BN soft-deleted. Có thể fail nếu code đã bị BN khác dùng (sau khi xóa). |

### Appointments

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **Lịch làm việc** | Working Schedule | Lịch định kỳ theo tuần của BS (vd: T2-T7 sáng 8h-12h). Có `validFrom`/`validTo`. |
| **Slot thời gian** | Time Slot | Khoảng thời gian đặt lịch (mặc định 30 phút). |
| **Nghỉ phép / Nghỉ** | Time-off | Khoảng thời gian BS không làm việc (nghỉ phép, nghỉ ốm, training). Block appointment. |
| **Cửa sổ check-in** | Check-in Window | Khoảng thời gian `[startAt - 15min, startAt + 30min]` cho phép check-in. |
| **Force check-in** | Force Check-in | Check-in ngoài window với override + reason (audit). |
| **Reschedule** | Reschedule | Đổi dentistId và/hoặc startAt của appointment. Giữ id, lưu log. Max 3 lần. |
| **Auto no-show** | Auto No-Show | Cron job tự chuyển `scheduled`/`confirmed` quá 15 phút sau startAt thành `no_show`. |
| **State machine** | Status State Machine | Các trạng thái + transition hợp lệ của Appointment. Xem SPEC §2.8. |
| **Nguồn đặt lịch** | Appointment Source | Nơi appointment được tạo: `walk_in`, `phone`, `online`, `returning`. |
| **Lịch tuần** | Week View | UI calendar hiển thị lịch theo tuần (thường dùng cho lễ tân/BS). |
| **Lịch ngày** | Day View | UI calendar hiển thị lịch theo ngày. |
| **Hàng đợi** | Waiting Queue | Danh sách BN đã check-in, sắp theo `checked_in_at ASC` (FIFO). |

### Medical Records

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **Encounter (lượt khám)** | Encounter | Phiên khám thực sự diễn ra. 1-1 với Appointment. |
| **Ghi chú lâm sàng** | Clinical Note | Văn bản tự do: chief complaint, diagnosis, treatment plan. Immutable sau khi encounter đóng. |
| **Addendum** | Addendum | Bổ sung cho Clinical Note sau khi encounter đóng (trong 30 ngày). |
| **Phiếu điều trị** | Treatment Record | Ghi nhận thao tác trong encounter: răng, procedure, giá, vật tư dùng. |
| **Toa thuốc** | Prescription | Danh sách thuốc kê cho BN sau encounter. |
| **Sơ đồ răng** | Dental Chart | Bản đồ tình trạng 32/20 răng. Mỗi encounter sinh 1 snapshot JSON. |
| **Chief complaint** | Chief Complaint | Lý do khám (BN khai). |
| **Diagnosis** | Diagnosis | Chẩn đoán của BS. |
| **Treatment plan** | Treatment Plan | Kế hoạch điều trị (text). |
| **Tooth number (FDI)** | FDI Notation | Chuẩn ký hiệu răng 11-48 (người lớn) hoặc 51-85 (răng sữa). |
| **Tooth number (Palmer)** | Palmer Notation | Chuẩn 1-8 cho mỗi góc hàm. |
| **EncounterClosed event** | EncounterClosed Domain Event | Event emit khi encounter đóng → trigger Inventory auto stock-out. |
| **EncounterAudit** | Encounter Audit Log | Append-only log các thay đổi của encounter. |
| **Reopen** | Reopen Encounter | Admin mở lại encounter đã đóng để sửa (audit). |

### Billing

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **Hóa đơn** | Invoice | Tài liệu tính tiền cho BN. 1-1 với Encounter. Có code `INV-YYYY-NNNNN`. |
| **Dòng hóa đơn** | Invoice Line / Invoice Item | Một mục trong hóa đơn (thường snapshot từ Treatment). |
| **Thanh toán** | Payment | Khoản tiền BN trả cho 1 invoice. |
| **Công nợ** | Outstanding | Số tiền BN còn nợ (total − paid). |
| **Partial payment** | Partial Payment | Trả 1 phần, status = partial, còn outstanding. |
| **Discount** | Discount / Giảm giá | Giảm trên subtotal. Theo % hoặc số tiền. |
| **Subtotal** | Subtotal | Tổng trước discount. |
| **Total** | Total | Subtotal − discount. Số tiền phải trả. |
| **Paid amount** | Paid Amount | Đã trả. |
| **Issue invoice** | Issue Invoice | Chuyển status draft → issued. Sau đó không sửa. |
| **Void** | Void Invoice | Hủy invoice. Admin only. Block nếu đã có payment (MVP). |
| **Reverse payment** | Reverse Payment | Admin undo payment (vd: nhập sai). Quay lại state trước. |
| **Auto-create invoice** | Auto-create Invoice | Event `EncounterClosed` → Billing tự tạo invoice draft (nếu có treatment). |
| **Optimistic lock** | Optimistic Lock | Field `version` để chống concurrent update. 412 nếu conflict. |
| **Báo cáo doanh thu** | Revenue Report | Tổng paidAmount trong khoảng. Group theo day/dentist/service. |
| **Báo cáo công nợ** | Outstanding Report | Danh sách invoice partial theo age. |

### Inventory

| Thuật ngữ | Tiếng Anh | Định nghĩa |
| --------- | --------- | ---------- |
| **Vật tư** | Inventory Item | Hàng hóa tiêu hao (composite, thuốc tê, găng tay…). Có `quantityOnHand`. |
| **Danh mục vật tư** | Inventory Category | Phân loại vật tư (vd: "Vật liệu hàn", "Thuốc tê"). 1 cấp parent. |
| **Tồn kho** | Quantity On Hand | Số lượng hiện có của vật tư. |
| **Ngưỡng tối thiểu** | Min Stock Level | Ngưỡng cảnh báo sắp hết. `quantityOnHand < minStockLevel` → low-stock. |
| **Nhập kho** | Stock-in | Tăng `quantityOnHand`. Ghi `StockMovement`. |
| **Xuất kho** | Stock-out | Giảm `quantityOnHand`. Có 2 loại: auto (từ encounter) và manual (hao phí). |
| **Kiểm kê** | Inventory Adjustment | Admin chỉnh `quantityOnHand` thủ công theo thực tế đếm được. Có reason. |
| **Hao phí / Spoilage** | Spoilage / Waste | Stock-out manual với reason = hỏng, đổ, v.v. |
| **Lịch sử kho** | Stock Movement | Bảng append-only ghi mọi thay đổi quantityOnHand. Audit trail. |
| **Low-stock alert** | Low-stock Alert | Cảnh báo sắp hết. UI: badge dashboard. |
| **Auto stock-out** | Auto Stock-out | Event `EncounterClosed` → Inventory tự động trừ kho theo `TreatmentInventoryUsage`. |
| **Discontinued** | Discontinued | Vật tư ngừng sử dụng (không pick trong encounter mới, vẫn stock-in/out được). |
| **SELECT FOR UPDATE** | Row-Level Lock | SQL lock để chống race condition khi stock-out concurrent. |
| **Giá vốn** | Cost Price | Giá mua vào, snapshot tại stock-in. |
| **SKU** | SKU | Mã vật tư (Stock Keeping Unit), unique. |

### Common security errors (Anti-pattern)

| Thuật ngữ | Vì sao tránh |
| --------- | ------------ |
| Lưu password dạng MD5/SHA | Rò rỉ nếu DB bị lộ. Dùng argon2id. |
| JWT trong URL query string | Lưu lại trong access log, proxy. Chỉ header + cookie. |
| Vô hiệu hoá user bằng cách xóa cứng | Mất audit. Chỉ set `deactivated_at`. |
| Thông báo "email không tồn tại" | Email enumeration. Luôn trả 204 cho forgot-password. |
| Single refresh token dùng nhiều lần | Reuse → thu hồi hết sessions. |
| Hard-code `if user.role === 'admin'` | Phá RBAC. Phải check permission. |

---

## H — Quy tắc cập nhật glossary

1. Mỗi thuật ngữ mới xuất hiện trong spec → **thêm vào glossary trước khi viết spec tiếp theo**.
2. Nếu có 2 cách hiểu khác nhau → định nghĩa ở đây là duy nhất. Mọi nơi khác dẫn chiếu về đây.
3. AI (Cursor) sẽ **tham chiếu glossary** khi viết code, ghi chú, hoặc review.
