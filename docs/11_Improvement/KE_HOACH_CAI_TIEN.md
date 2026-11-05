# Kế hoạch cải tiến nghiệp vụ, thao tác và giao diện

> Ngày lập: 04/11/2026. Phạm vi: toàn bộ actor (lễ tân, bác sĩ, quản lý / chủ phòng khám, quản trị, bệnh nhân qua trang đặt lịch).
> Cách làm: đọc lại hệ thống hiện tại (menu, route, quyền, luồng, biểu đồ), so với tài liệu mở của phần mềm nha khoa khác, nghiên cứu y tế, hướng dẫn trực quan hoá dữ liệu và văn bản pháp luật Việt Nam. Mỗi đề xuất ghi nguồn bằng số `[n]`, danh sách ở cuối.
> Ưu tiên: **luồng nghiệp vụ chính** (một lượt khám từ đặt lịch tới thanh toán và tái khám) trước, **luồng quản lý** sau.

## 0. Tiến độ

| Đợt | Việc | Trạng thái |
|---|---|---|
| 0 | B2 Heatmap công suất | Đã làm: thẻ "Công suất theo giờ" trên Dashboard (`GET /billing/reports/capacity-heatmap`) |
| 0 | B1 Bullet graph | Đã làm cho 4 chỉ số (vắng mặt, có lịch hẹn tiếp, chấp nhận kế hoạch, thời gian chờ); `GET /billing/reports/scorecard`. Còn lại 3 chỉ số của bảng B1 (huỷ sát giờ, công suất ghế tổng, tỉ lệ thu) |
| 0 | A6.1 VietQR trên hoá đơn | Đã làm; cấu hình ở `docs/08_Deployment/VIETQR.md`. A6.3 webhook ngân hàng đã làm (xem dòng dưới) |
| 1 | A6.2 Đặt hẹn tiếp khi thu tiền | Đã làm: hoá đơn **Đã thanh toán** có thẻ "Hẹn lần khám tiếp" (xem lịch hẹn đã có, hoặc mở form đặt lịch điền sẵn bệnh nhân, bác sĩ, loại tái khám). Chưa gợi ý ngày từ lượt tái khám của dịch vụ |
| 1 | A7 Điều trị chờ đặt lịch | Đã làm: trang `/pending-treatments`, `GET /treatment-plans/pending` (BR-TP-012). Còn lại: ghi lần liên hệ gần nhất, soạn tin AI cho nhóm này, chỉ số tỉ lệ chấp nhận theo bác sĩ |
| 1 | A6.3 Webhook ngân hàng | Đã làm cho SePay: `POST /webhooks/bank/sepay` tự ghi phiếu thu khi nội dung có mã hóa đơn và số tiền vừa đủ; còn lại vào danh sách "Chuyển khoản cần xử lý" và chuông thông báo. Cài đặt: `docs/08_Deployment/BANK_WEBHOOK.md`. Chưa làm: nhà cung cấp khác (Casso, payOS), tự gợi ý hóa đơn khớp cho giao dịch chờ |

## Tóm tắt

| # | Đề xuất | Actor | Vì sao đáng làm | Công sức | Đợt |
|---|---|---|---|---|---|
| A1 | Khách tự **xác nhận / xin dời** lịch từ link trong tin nhắc | Bệnh nhân, lễ tân | Nhắc lịch giảm vắng ~1/3 [9][10]; lễ tân bớt gọi điện xác nhận | M | 1 |
| A2 | **Danh sách chờ lấp giờ trống** khi có lịch hủy | Lễ tân | Open Dental có "ASAP list" gửi tin mời khách lấy giờ trống [1][2] | M | 1 |
| A3 | **Phiếu khai trước khi đến** (tiền sử, dị ứng, đồng ý xử lý dữ liệu) | Bệnh nhân, lễ tân | Bớt nhập tay ở quầy [15][16]; lưu được bằng chứng đồng ý theo NĐ 356/2025 [20] | M | 1 |
| A4 | **Bảng trạng thái theo ghế / bác sĩ** trên Điều phối, cảnh báo chờ lâu | Lễ tân, bác sĩ | Bảng trạng thái tự động giảm trung vị thời gian ở phòng khám 12'44" [13] | M | 1 |
| A5 | **Mẫu khám nhanh theo dịch vụ** (ghi chú + điều trị + vật tư một lần chọn) | Bác sĩ | Ghi chép chiếm phần lớn thời gian trên hệ thống [14]; giảm số thao tác | M | 1 |
| A6 | **Thanh toán một màn hình**: VietQR có sẵn số tiền + đặt hẹn tiếp ngay khi thu tiền | Lễ tân | Tỉ lệ đặt hẹn lại ngay lúc thanh toán nên ≥85% [6][7]; VietQR theo chuẩn NAPAS [17] | S–M | 0/1 |
| A7 | **Danh sách "đã chấp nhận điều trị nhưng chưa đặt lịch"** | Lễ tân, bác sĩ | "Treatment Finder" của Open Dental [3]; tỉ lệ chấp nhận điều trị TB 45%, nhóm tốt 75% [7] | S | 1 |
| B1 | Dashboard theo **chỉ số có mục tiêu** (bullet graph) | Quản lý | Bullet graph thay đồng hồ, gọn và đọc nhanh [22] | S | 0 |
| B2 | **Heatmap công suất** theo thứ × giờ, theo bác sĩ | Quản lý, lễ tân | Lộ giờ trống / giờ vắng nhiều mà số trung bình che mất [11][12] | S | 0 |
| B3 | **Phễu bệnh nhân** (đặt → đến → khám → thanh toán → quay lại) và **thác nước tài chính** | Quản lý | Dạng "flow" và "deviation" trong Visual Vocabulary [23] | S–M | 0/1 |
| B4 | Kho: **gợi ý nhập hàng** theo tốc độ dùng | Quản lý kho | Bớt tính tay khi vật tư chạm mức tối thiểu | S | 2 |
| B5 | Lịch làm / ca: **heatmap phủ ca so với nhu cầu đặt lịch** | Quản lý | Cùng nguyên lý heatmap đặt lịch [12] | S | 2 |
| C1 | Đơn thuốc điện tử **liên thông Đơn thuốc quốc gia** | Bác sĩ | TT 26/2025 yêu cầu cơ sở KCB khác kê đơn điện tử [19] | L | 2 |
| C2 | Hồ sơ bệnh án điện tử: **ký số, khoá, lưu vết** theo TT 13/2025 | Bác sĩ, quản trị | Lộ trình bắt buộc với cơ sở KCB [18] | L | 2 |
| C3 | **Sổ đồng ý xử lý dữ liệu** có thời điểm, nội dung, kênh | Quản trị | NĐ 356/2025 yêu cầu lưu và kiểm chứng được sự đồng ý [20][21] | M | 1 |

Công sức: S ≤ 1 ngày, M 2–4 ngày, L ≥ 1 tuần. Đợt 0 là các việc ít rủi ro, làm được trước buổi bảo vệ 09/11; đợt 1 là sau bảo vệ (luồng chính); đợt 2 là luồng quản lý và tuân thủ pháp luật.

## 1. Hệ thống hiện tại (tóm tắt)

| Actor | Màn hình chính | Việc chính |
|---|---|---|
| Bệnh nhân | Trang chủ, đặt lịch online, tra cứu / huỷ lượt | Chọn dịch vụ, bác sĩ, giờ trống; nhận email |
| Lễ tân | Lịch hẹn, Điều phối (hàng chờ), Yêu cầu đặt lịch, Nhắc tái khám, Hoá đơn, Kho | Đặt lịch, check-in, gọi khám, thu tiền, gọi nhắc |
| Bác sĩ | Hôm nay, Hàng chờ của tôi, Phiên khám (5 tab), Lịch / Ca / Lương của tôi | Khám, ghi chú, điều trị, đơn thuốc, sơ đồ răng, đóng phiên |
| Quản lý / admin | Dashboard, Báo cáo, Bảng lương, Chi phí, Nhân sự, Dịch vụ, Lịch làm việc, Quản trị | Theo dõi doanh thu, duyệt ca, chốt lương, cấu hình |

Đã có và không cần làm lại: nhắc lịch tự động một ngày trước (email, eSMS, Zalo ZNS); thời gian chờ trên Điều phối (đỏ khi quá 30 phút); tự tạo lượt tái khám theo dịch vụ (`recallIntervalMonths`); AI tóm tắt hồ sơ và soạn nháp ghi chú, tin nhắn, nhận xét báo cáo.

Biểu đồ hiện có: ô KPI, 7 biểu đồ cột, 3 biểu đồ đường (Dashboard, Báo cáo). Chưa có mục tiêu, chưa có heatmap, phễu, thác nước hay so sánh nhiều bác sĩ cạnh nhau.

## 2. Luồng nghiệp vụ chính: một lượt khám

```
Đặt lịch ─► Nhắc + xác nhận ─► Check-in ─► Hàng chờ ─► Khám ─► Đóng phiên ─► Thu tiền ─► Hẹn tiếp / tái khám
   A2           A1               A3          A4         A5                    A6            A6, A7
```

### A1. Khách tự xác nhận hoặc xin dời lịch từ tin nhắc

- **Hiện tại:** tin nhắc chỉ báo giờ; xác nhận lịch là việc lễ tân bấm `POST /appointments/:id/confirm` sau khi gọi điện. Khách chỉ tự huỷ được lượt đặt online qua mã tra cứu.
- **Đề xuất:** tin nhắc (email / SMS / ZNS) kèm link có mã một lần: **Xác nhận**, **Xin dời** (chọn giờ trống khác, lễ tân duyệt), **Huỷ** (theo quy tắc 24 giờ đang có). Lịch xác nhận hiện huy hiệu "Khách đã xác nhận" trên lịch và Điều phối. Lịch chưa xác nhận trước 18 giờ ngày hôm trước vào danh sách "cần gọi".
- **Đo:** tỉ lệ vắng mặt và huỷ sát giờ (mục tiêu ≤5% theo ADA [5]); số cuộc gọi xác nhận mỗi ngày.
- **Nguồn:** tổng quan hệ thống: tin nhắc giảm vắng mặt khoảng 34% so với mức nền [10]; meta-analysis SMS RR 0,77 [9]; cách viết tin ảnh hưởng tỉ lệ vắng (14,2% so với 21,1%) [11]; ZNS cho phép khách phản hồi để xác nhận hoặc đổi lịch [24].

### A2. Danh sách chờ lấp giờ trống

- **Hiện tại:** lịch huỷ để lại giờ trống, không có danh sách khách muốn đến sớm hơn.
- **Đề xuất:** khi đặt lịch, lễ tân (hoặc khách ở trang đặt online) đánh dấu "muốn sớm hơn nếu có chỗ". Khi một lịch bị huỷ, hệ thống liệt kê khách phù hợp (cùng dịch vụ, cùng bác sĩ hoặc bác sĩ khác cùng chuyên môn) và có nút gửi tin mời kèm link nhận giờ; ai nhận trước được giữ chỗ.
- **Nguồn:** Open Dental ASAP List, có hai tab lịch và tái khám, gửi "Web Sched ASAP" để khách nhận hoặc từ chối giờ trống [1][2].

### A3. Phiếu khai trước khi đến

- **Hiện tại:** lễ tân nhập thông tin hành chính, bác sĩ hỏi lại tiền sử và dị ứng.
- **Đề xuất:** link phiếu gửi kèm xác nhận đặt lịch: thông tin hành chính, tiền sử, dị ứng, thuốc đang dùng, ô đồng ý xử lý dữ liệu sức khoẻ (C3). Khách điền xong thì hồ sơ có trạng thái "chờ lễ tân duyệt"; lễ tân bấm duyệt để ghi vào hồ sơ (không ghi đè dị ứng đã có mà hiện so sánh).
- **Lưu ý về bằng chứng:** chỉ có số liệu của nhà cung cấp (giảm 30–50% thời gian check-in, 90% khách đã bắt đầu thì điền xong) [15][16], chưa có nghiên cứu độc lập. Nên đo trước và sau khi áp dụng.

### A4. Bảng trạng thái theo ghế / bác sĩ

- **Hiện tại:** Điều phối là danh sách hàng chờ; Hôm nay là lịch cả phòng khám.
- **Đề xuất:** thêm chế độ xem dạng **cột theo bác sĩ (hoặc ghế)**, mỗi thẻ một bệnh nhân với trạng thái màu (đã đến, đang chờ X phút, đang khám Y phút, chờ thanh toán). Thêm cột "chờ thanh toán" để lễ tân thấy ngay ai vừa khám xong. Mô hình **ghế / phòng** (resource) là phần mở rộng sau.
- **Nguồn:** bảng trạng thái tự động giảm trung vị thời gian bệnh nhân ở phòng khám 12 phút 44 giây và tăng hài lòng [13]; lịch Open Dental chia cột theo ghế (operatory) [3].

### A5. Mẫu khám nhanh theo dịch vụ

- **Hiện tại:** bác sĩ nhập ghi chú, thêm điều trị, chọn vật tư ở các tab riêng; đã có "AI soạn từ ghi nhanh".
- **Đề xuất:** mỗi dịch vụ có **mẫu** gồm ghi chú gợi ý, điều trị mặc định, vật tư thường dùng. Trong phiên khám, chọn răng trên sơ đồ rồi chọn mẫu, hệ thống điền cả ba phần; bác sĩ chỉ sửa chỗ khác. Kết hợp với ghi nhanh AI.
- **Đo:** số thao tác và thời gian từ "Bắt đầu khám" tới "Đóng phiên" (lấy từ nhật ký).
- **Nguồn:** ghi chép chiếm khoảng 33% thời gian mỗi lần khám, số cú bấm cho cùng một việc dao động 9–165 [14].

### A6. Thanh toán một màn hình

- **Hiện tại:** thanh toán tiền mặt hoặc chuyển khoản (lễ tân tự đối chiếu); đặt hẹn tiếp là thao tác riêng ở trang lịch.
- **Đề xuất:**
  1. **VietQR động** trên hoá đơn và màn hình thu tiền: mã có sẵn số tài khoản phòng khám, số tiền còn nợ, nội dung = mã hoá đơn (không dấu, ≤19 ký tự). Sinh tại máy chủ theo chuẩn EMV/NAPAS, không cần gọi dịch vụ ngoài [17].
  2. Sau khi thu tiền, nếu phiên có kế hoạch điều trị hoặc dịch vụ có tái khám, mở ngay **"Đặt hẹn tiếp"** với dịch vụ, bác sĩ và khoảng ngày gợi ý sẵn.
  3. (Sau) nhận webhook ngân hàng để tự đánh dấu đã thu.
- **Đo:** tỉ lệ đặt hẹn lại tại quầy (mục tiêu ≥85% theo Curve [6]; Catalyst: TB 76%, nhóm tốt 92% [7]).

### A7. Điều trị đã chấp nhận nhưng chưa đặt lịch

- **Hiện tại:** kế hoạch điều trị có trạng thái `ACCEPTED`, `IN_PROGRESS` và từng hạng mục `PLANNED / DONE / SKIPPED`, nhưng không có danh sách gom các hạng mục còn `PLANNED` mà khách chưa có lịch.
- **Đề xuất:** trang "Điều trị chờ đặt lịch" (giống trang Nhắc tái khám): bệnh nhân, hạng mục, giá trị, ngày chấp nhận, lần liên hệ gần nhất; nút gọi, AI soạn tin, đặt lịch.
- **Đo:** tỉ lệ chấp nhận kế hoạch, giá trị điều trị đã chấp nhận còn chưa đặt lịch.
- **Nguồn:** Open Dental Treatment Finder [3] và cách theo dõi tỉ lệ chấp nhận [4]; tỉ lệ chấp nhận điều trị TB 45%, nhóm tốt 75%, ADA khuyến nghị 75–80% [5][7].

## 3. Luồng quản lý

### B1. Dashboard theo chỉ số có mục tiêu

Thay một phần ô KPI bằng **bullet graph**: thanh giá trị thật, vạch mục tiêu, nền 2–3 dải "kém / đạt / tốt" cùng một màu nhạt dần [22]. Mục tiêu đặt trong Cài đặt, mặc định theo nguồn:

| Chỉ số | Công thức (dữ liệu đã có) | Mặc định | Nguồn |
|---|---|---|---|
| Tỉ lệ vắng mặt | NO_SHOW / lịch không huỷ | ≤ 5% | [5][7] |
| Huỷ sát giờ | huỷ < 24 giờ / tổng lịch | ≤ 5% | [5] |
| Đặt hẹn lại tại quầy | lượt khám có lịch tiếp trong 7 ngày / lượt khám | ≥ 85% | [6][7] |
| Tỉ lệ chấp nhận kế hoạch | ACCEPTED+ / PROPOSED+ | ≥ 75% | [5][7] |
| Công suất ghế | giờ có lịch / giờ làm việc | 85–90% | [6] |
| Thời gian chờ trung vị | check-in → bắt đầu khám | ≤ 15 phút | đề xuất, chỉnh theo phòng khám |
| Tỉ lệ thu | đã thu / doanh thu kỳ | ≥ 95% | đề xuất; định nghĩa chỉ số theo [8] |

Mỗi chỉ số có tooltip ghi công thức, để số liệu kiểm chứng được (ý tương tự cột "basis" của tóm tắt AI).

### B2. Heatmap công suất

Lưới **thứ (cột) × giờ (hàng)**, mỗi ô là % giờ có lịch so với giờ làm việc của bác sĩ trong khung đó; màu tuần tự một sắc. Chọn được theo bác sĩ, và chuyển giữa "công suất" và "tỉ lệ vắng". Lễ tân dùng để biết nên mời khách vào khung nào; quản lý dùng để xếp ca.

Nguồn: heatmap thứ × giờ lộ ra chiều thứ Sáu vắng nhiều hơn sáng thứ Hai, điều mà số trung bình tháng che mất [12]; heatmap công suất phòng khám có định nghĩa 100% rõ ràng [12]; nghiên cứu dự báo vắng mặt dùng heatmap tổng xác suất vắng theo khung giờ [11].

### B3. Phễu bệnh nhân và thác nước tài chính

- **Phễu / Sankey:** nguồn khách (online, điện thoại, vãng lai) → đặt lịch → đến → khám → thanh toán → quay lại trong 6 tháng. Cho thấy rơi ở bước nào và theo nguồn nào.
- **Thác nước:** doanh thu điều trị → giảm giá → hoàn tiền → đã thu → chi phí → lương → còn lại.
- **Small multiples:** mỗi bác sĩ một biểu đồ nhỏ cùng trục (doanh thu, lượt khám, tỉ lệ chấp nhận) thay cho một bảng xếp hạng.
- **Thanh chồng tuổi nợ:** 0–30 / 31–60 / 61–90 / >90 ngày theo tháng.

Nguồn: Visual Vocabulary của Financial Times xếp Sankey và thác nước vào nhóm "flow", thanh lệch vào nhóm "deviation", thanh xếp hạng và slope vào "ranking" [23].

### B4. Kho: gợi ý nhập hàng

Từ lượng xuất 30 / 90 ngày tính số ngày còn dùng được; danh sách "nên nhập" có số lượng gợi ý = (lượng dùng bình quân × số ngày đặt hàng) − tồn. Dùng trang lịch sử xuất nhập vừa làm.

### B5. Phủ ca so với nhu cầu

Đặt heatmap giờ làm việc đã duyệt cạnh heatmap đặt lịch (B2) để thấy khung thiếu bác sĩ hoặc thừa giờ trống trước khi duyệt ca.

## 4. Tuân thủ pháp luật (sau bảo vệ)

| # | Văn bản | Yêu cầu chính | Hệ thống hiện tại | Việc cần làm |
|---|---|---|---|---|
| C1 | TT 27/2021, TT 26/2025 (đơn thuốc điện tử) | Cơ sở KCB khác kê đơn điện tử, có mã đơn thuốc để nhà thuốc tra cứu [19] | Đơn thuốc trong hệ thống, in giấy | Kết nối API Đơn thuốc quốc gia (QĐ 808/QĐ-BYT), mã cơ sở, mã người hành nghề |
| C2 | TT 13/2025 (bệnh án điện tử, thay TT 46/2018) | Lập, ký, lưu trữ, khai thác bằng phương tiện điện tử; có lộ trình [18] | Ghi chú khoá khi đóng phiên, addendum 30 ngày, nhật ký | Ký số khi đóng phiên, xuất hồ sơ, chính sách lưu trữ |
| C3 | Luật BVDLCN 2025, NĐ 356/2025 (thay NĐ 13/2023) | Lưu và kiểm chứng được thời điểm, nội dung đồng ý [20][21] | Có opt-out nhận tin tái khám; chưa có sổ đồng ý | Bảng "đồng ý" theo mục đích và kênh, gắn với phiếu khai A3 |

Các mốc thời gian trong bảng lấy từ bài tóm tắt pháp luật, **cần đối chiếu văn bản gốc** trước khi đưa vào luận văn (phiên làm việc này không truy cập được trang văn bản gốc).

## 5. Lộ trình và cách làm từng việc

Mỗi việc là một PR riêng: đặc tả ngắn (BR mới) → backend + test → giao diện + locale → E2E → nhật ký → CI xanh → merge → deploy.

**Đợt 0: trước bảo vệ (đến 08/11), chỉ thêm, không sửa luồng đang chạy**

1. B2 Heatmap công suất (Dashboard, chỉ đọc).
2. B1 Bullet graph cho 4 chỉ số: vắng mặt, đặt hẹn lại, chấp nhận kế hoạch, thời gian chờ.
3. A6.1 VietQR trên hoá đơn (hiển thị, cấu hình số tài khoản trong env).

Ba việc này dùng dữ liệu đã có, không có migration, dễ demo và có số liệu để đưa vào chương "kết quả".

**Đợt 1: sau bảo vệ, luồng chính:** A7 → A1 → A6.2 → A4 → A2 → A3 + C3 → A5.

**Đợt 2: quản lý và pháp luật:** B3, B4, B5, C1, C2.

## 6. Giới hạn của nghiên cứu này

- Nhiều số liệu về nha khoa (KPI, phiếu khai trước) đến từ nhà cung cấp phần mềm [6][7][15][16], có lợi ích thương mại; bảng trên ghi rõ nguồn để người đọc tự cân nhắc. Số liệu về nhắc lịch [9][10] và bảng trạng thái [13] là nghiên cứu, nhưng không riêng cho nha khoa tại Việt Nam.
- Văn bản pháp luật được tóm tắt từ kết quả tìm kiếm, chưa đọc nguyên văn.
- Nên đo chỉ số hiện tại (dữ liệu demo / thật) trước khi làm, để sau mỗi đợt so được trước và sau.

## 7. Nguồn tham khảo

Phần mềm nha khoa (tài liệu mở)

1. Open Dental, *ASAP List*. https://opendental.com/manual/asaplist.html
2. Open Dental, *Unscheduled List*; *Appointment Lists*. https://opendental.com/manual/unscheduled.html; https://opendental.com/manual/appointmentlists.html
3. Open Dental, *Treatment Finder*; *Appointments Module* (operatories, Daily Goal). https://opendental.com/manual/reporttreatfinder.html; https://opendental.com/Manual/appointments.html
4. Open Dental Blog, *Boosting Case Acceptance and Tracking Results*. https://opendental.blog/boosting-case-acceptance-and-tracking-results

Chỉ số vận hành nha khoa

5. American Dental Association, *Measuring Success*. https://www.ada.org/resources/practice/practice-management/measuring-success20160428t155202
6. Curve Dental, *Dental KPI Template: Five Metrics That Actually Signal Practice Health*. https://www.curvedental.com/dental-blog/dental-kpi-template-five-metrics-that-actually-signal-practice-health
7. Henry Schein One, *2026 Catalyst Index: Dental Practice Benchmarking Report*. https://henryscheinone.com/insights/ebook/2026-catalyst-index
8. NetSuite, *Dental Practice Metrics*. https://netsuite.com/portal/resource/articles/erp/dental-metrics.shtml

Nghiên cứu y tế

9. *Effect of SMS reminders on attendance rates for healthcare appointments: a systematic review & meta-analysis* (RR 0,77). https://aminer.org/pub/648ee507d68f896efa90edb2
10. Hasvold P.E., Wootton R., *Use of telephone and SMS reminders to improve attendance at hospital appointments: a systematic review*. https://pmc.ncbi.nlm.nih.gov/articles/PMC3188816/
11. *It's how you say it: Systematic A/B testing of digital messaging cut hospital no-show rates*. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7310733/ ; *Predicting Patient No-Shows in Community Health Clinics*. https://arxiv.org/pdf/2310.17506
12. Curogram, *Appointment scheduling analytics heatmap*. https://curogram.com/blog/appointment-scheduling-analytics-heatmap ; SyncTimes, *Exam room utilization report*. https://synctimes.com/blog/exam-room-utilization-report ; Cubiko, *Practice busiest time*. https://kb.cubiko.com.au/en/practice-busiest-time
13. Journal of Student-Run Clinics, nghiên cứu bảng trạng thái tự động (giảm 12'44" trung vị). https://www.journalsrc.studentrunfreeclinics.org/index.php/jsrc/article/download/434/263
14. Thieme, *Applied Clinical Informatics* (thời gian ghi chép trên EHR). https://www.thieme-connect.de/products/ejournals/html/10.1055/s-0042-1756422 ; HealthExec, *HIMSS: How many EHR mouse clicks make a visit inefficient?* https://healthexec.com/topics/health-it/medical-records/himss-2013/himss-how-many-ehr-mouse-clicks-make-visit-inefficient

Phiếu khai trước (nguồn nhà cung cấp)

15. Henry Schein One, *Launches Forms to Make Patient Check-In Easier and Faster* (2025). https://www.henryscheinone.com/about-us/press-release/henry-schein-one-launches-forms-to-make-patient-check-in-easier-and-faster/
16. Curogram, *Reduce check-in times*. https://curogram.com/blog/emr-integration/dolphin-management/reduce-check-in-times-dolphin

Việt Nam: thanh toán, pháp luật, kênh tin nhắn

17. VietQR, *Quick Link*; *API Generate VietQR Code*. https://www.vietqr.io/qr-dong.md ; https://api.vietqr.vn/en/vn/api-vietqr-callback/goi-api-generate-vietqr-code ; thư viện mở `vnqr`. https://pypi.org/project/vnqr/
18. Thông tư 13/2025/TT-BYT hướng dẫn triển khai hồ sơ bệnh án điện tử. https://caselaw.vn/van-ban-phap-luat/587211-thong-tu-so-13-2025-tt-byt-ngay-06-06-2025-cua-bo-truong-bo-y-te-huong-dan-trien-khai-ho-so-benh-an-dien-tu ; https://pbgdpl.cantho.gov.vn/lo-trinh-trien-khai-ho-so-benh-an-dien-tu
19. Thông tư 27/2021/TT-BYT kê đơn thuốc điện tử; hướng dẫn Đơn thuốc quốc gia; Thông tư 04/2022 (được thay bởi TT 26/2025). https://caselaw.vn/van-ban-phap-luat/401810-thong-tu-so-27-2021-tt-byt-ngay-20-12-2021-cua-bo-truong-bo-y-te-quy-dinh-ke-don-thuoc-bang-hinh-thuc-dien-tu ; https://donthuocquocgia.vn/huong-dan-su-dung.pdf ; https://hoatieu.vn/phap-luat/thong-tu-04-2022-tt-byt-215310
20. Mondaq, *Key developments in personal data protection under Decree 356*. https://www.mondaq.com/privacy-protection/1731760/key-developments-in-personal-data-protection-under-decree-356
21. Nghị định 13/2023/NĐ-CP (đã được thay thế), Điều 17. https://hethongphapluat.com/nghi-dinh-13-2023-nd-cp-ve-bao-ve-du-lieu-ca-nhan/dieu-17

Trực quan hoá dữ liệu

22. Stephen Few, *Bullet Graph Design Specification* (Perceptual Edge). https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf ; Tableau, *Stephen Few riffs on bullet graphs*. https://www.tableau.com/blog/stephen-few-riffs-bullet-graphs
23. Financial Times, *Visual Vocabulary* (bản PDF của Knight Center). https://knightcenter.utexas.edu/JC/courses/DATA0819/Eng/The-Visual-Vocabulary.pdf ; Flourish, *How to choose the right chart type*. https://flourish.studio/2018/09/28/choosing-the-right-visualisation/

Kênh tin nhắn

24. Brands Vietnam, *Sử dụng ZNS trong lĩnh vực Y tế*. https://www.brandsvietnam.com/congdong/topic/337603-Su-dung-ZNS-trong-linh-vuc-Y-Te-Cham-soc-suc-khoe-nhu-the-nao-cho-hieu-qua ; Infobip, *Zalo compliance and guidelines*. https://www.infobip.com/docs/zalo/compliance-guidelines.md
