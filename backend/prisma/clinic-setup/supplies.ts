/**
 * Opening-day inventory and expense categories. Stock starts at 0: the first
 * purchase is recorded as a stock-in on the Kho screen. Cost prices are
 * typical 2026 distributor prices (VND) and only a starting point; the setup
 * script inserts missing SKUs / names and never changes existing rows.
 */
export const INVENTORY_CATEGORIES = [
  { key: 'TIEU_HAO', name: 'Vật tư tiêu hao', description: 'Găng tay, khẩu trang, gạc, kim tiêm…' },
  {
    key: 'THUOC',
    name: 'Thuốc & thuốc tê',
    description: 'Thuốc tê, kháng sinh, giảm đau, nước súc miệng',
  },
  { key: 'TRAM', name: 'Vật liệu trám', description: 'Composite, bonding, GIC, trám tạm' },
  { key: 'NOI_NHA', name: 'Vật liệu nội nha', description: 'Trâm, côn, xi măng trám bít ống tủy' },
  {
    key: 'PHUC_HINH',
    name: 'Vật liệu lấy dấu & phục hình',
    description: 'Alginate, silicone, xi măng gắn',
  },
  { key: 'DUNG_CU', name: 'Dụng cụ & mũi khoan', description: 'Mũi khoan, đài đánh bóng, gương' },
  {
    key: 'KHU_KHUAN',
    name: 'Vệ sinh & khử khuẩn',
    description: 'Dung dịch khử khuẩn, túi hấp, cồn',
  },
  { key: 'CHINH_NHA', name: 'Vật tư chỉnh nha', description: 'Mắc cài, dây cung, thun' },
  { key: 'IMPLANT', name: 'Vật tư Implant', description: 'Trụ, abutment, vật liệu ghép xương' },
];

// [sku, categoryKey, name, unit, minStock, costPrice]
type Item = [string, string, string, string, number, number];
export const INVENTORY_ITEMS: Item[] = [
  ['VT-GANG-S', 'TIEU_HAO', 'Găng tay y tế size S (hộp 100)', 'hộp', 5, 90_000],
  ['VT-GANG-M', 'TIEU_HAO', 'Găng tay y tế size M (hộp 100)', 'hộp', 10, 90_000],
  ['VT-KHAU-TRANG', 'TIEU_HAO', 'Khẩu trang y tế 4 lớp (hộp 50)', 'hộp', 10, 45_000],
  ['VT-MU-GIAY', 'TIEU_HAO', 'Mũ giấy trùm đầu (gói 100)', 'gói', 3, 60_000],
  ['VT-KHAN-YEM', 'TIEU_HAO', 'Khăn yếm nha khoa (gói 125)', 'gói', 5, 120_000],
  ['VT-COC-GIAY', 'TIEU_HAO', 'Cốc giấy súc miệng (ống 50)', 'ống', 10, 25_000],
  ['VT-ONG-HUT', 'TIEU_HAO', 'Ống hút nước bọt (gói 100)', 'gói', 5, 70_000],
  ['VT-BONG-GON', 'TIEU_HAO', 'Bông gòn cuộn nha khoa', 'gói', 10, 30_000],
  ['VT-GAC', 'TIEU_HAO', 'Gạc vô trùng 5x5 (gói 10)', 'gói', 20, 15_000],
  ['VT-KIM-NHA-KHOA', 'TIEU_HAO', 'Kim tiêm nha khoa 27G (hộp 100)', 'hộp', 3, 250_000],
  ['VT-BOM-TIEM', 'TIEU_HAO', 'Bơm tiêm nhựa 5ml (hộp 100)', 'hộp', 2, 150_000],
  ['VT-CHI-KHAU', 'TIEU_HAO', 'Chỉ khâu tiêu 4.0 (hộp 12)', 'hộp', 2, 600_000],

  ['TH-LIDOCAINE', 'THUOC', 'Thuốc tê Lidocaine 2% (hộp 50 ống)', 'hộp', 3, 450_000],
  ['TH-ARTICAINE', 'THUOC', 'Thuốc tê Articaine 4% (hộp 50 ống)', 'hộp', 3, 900_000],
  ['TH-TE-BOI', 'THUOC', 'Gel tê bôi Benzocaine', 'tuýp', 3, 150_000],
  ['TH-AMOXICILLIN', 'THUOC', 'Amoxicillin 500mg (hộp 100 viên)', 'hộp', 2, 120_000],
  ['TH-METRONIDAZOLE', 'THUOC', 'Metronidazole 250mg (hộp 100 viên)', 'hộp', 2, 60_000],
  ['TH-PARACETAMOL', 'THUOC', 'Paracetamol 500mg (hộp 100 viên)', 'hộp', 2, 50_000],
  ['TH-IBUPROFEN', 'THUOC', 'Ibuprofen 400mg (hộp 100 viên)', 'hộp', 2, 80_000],
  ['TH-CHLORHEXIDINE', 'THUOC', 'Nước súc miệng Chlorhexidine 0.12%', 'chai', 5, 90_000],

  ['VL-COMPOSITE-A2', 'TRAM', 'Composite quang trùng màu A2 (ống 4g)', 'ống', 5, 350_000],
  ['VL-COMPOSITE-A3', 'TRAM', 'Composite quang trùng màu A3 (ống 4g)', 'ống', 5, 350_000],
  ['VL-COMPOSITE-FLOW', 'TRAM', 'Composite lỏng (xylanh)', 'xylanh', 5, 250_000],
  ['VL-BONDING', 'TRAM', 'Keo dán Bonding', 'chai', 2, 700_000],
  ['VL-ETCHING', 'TRAM', 'Acid etching 37%', 'xylanh', 3, 80_000],
  ['VL-GIC', 'TRAM', 'Xi măng trám GIC', 'hộp', 2, 600_000],
  ['VL-TRAM-TAM', 'TRAM', 'Vật liệu trám tạm', 'lọ', 3, 120_000],
  ['VL-CALCIUM-HYDROXIDE', 'TRAM', 'Calcium hydroxide', 'lọ', 2, 250_000],

  ['ND-TRAM-XOAY', 'NOI_NHA', 'Trâm nội nha xoay (vỉ 6)', 'vỉ', 5, 450_000],
  ['ND-CONE-GUTTA', 'NOI_NHA', 'Côn gutta-percha', 'hộp', 3, 150_000],
  ['ND-CONE-GIAY', 'NOI_NHA', 'Côn giấy', 'hộp', 3, 100_000],
  ['ND-XI-MANG-TRAM-BIT', 'NOI_NHA', 'Xi măng trám bít ống tủy', 'bộ', 1, 1_200_000],
  ['ND-NAOCL', 'NOI_NHA', 'Dung dịch bơm rửa NaOCl', 'chai', 3, 80_000],

  ['PH-ALGINATE', 'PHUC_HINH', 'Chất lấy dấu Alginate (gói 450g)', 'gói', 5, 150_000],
  ['PH-SILICONE', 'PHUC_HINH', 'Silicone lấy dấu', 'bộ', 2, 900_000],
  ['PH-XI-MANG-GAN', 'PHUC_HINH', 'Xi măng gắn mão', 'hộp', 2, 500_000],

  ['DC-MUI-KIM-CUONG', 'DUNG_CU', 'Mũi khoan kim cương (vỉ 5)', 'vỉ', 10, 100_000],
  ['DC-MUI-CARBIDE', 'DUNG_CU', 'Mũi khoan carbide (vỉ 5)', 'vỉ', 5, 150_000],
  ['DC-DAI-DANH-BONG', 'DUNG_CU', 'Chổi / đài đánh bóng (gói)', 'gói', 3, 120_000],
  ['DC-GUONG', 'DUNG_CU', 'Gương nha khoa', 'cái', 10, 30_000],

  ['KK-CON-70', 'KHU_KHUAN', 'Cồn 70 độ (chai 1L)', 'chai', 5, 50_000],
  ['KK-DUNG-DICH-DUNG-CU', 'KHU_KHUAN', 'Dung dịch khử khuẩn dụng cụ (can 5L)', 'can', 2, 600_000],
  ['KK-TUI-HAP', 'KHU_KHUAN', 'Túi hấp tiệt trùng (hộp 200)', 'hộp', 3, 250_000],
  ['KK-KHAN-LAU-BE-MAT', 'KHU_KHUAN', 'Khăn lau khử khuẩn bề mặt', 'hộp', 5, 150_000],

  ['CN-MAC-CAI-KIM-LOAI', 'CHINH_NHA', 'Bộ mắc cài kim loại', 'bộ', 3, 600_000],
  ['CN-DAY-CUNG-NITI', 'CHINH_NHA', 'Dây cung NiTi (gói 10)', 'gói', 5, 200_000],
  ['CN-THUN-BUOC', 'CHINH_NHA', 'Thun buộc mắc cài', 'gói', 5, 80_000],

  ['IM-TRU-HAN-QUOC', 'IMPLANT', 'Trụ Implant Hàn Quốc', 'cái', 3, 3_500_000],
  ['IM-ABUTMENT', 'IMPLANT', 'Abutment', 'cái', 3, 1_200_000],
  ['IM-BOT-XUONG', 'IMPLANT', 'Bột xương ghép (lọ 0.5g)', 'lọ', 2, 2_500_000],
];

export const EXPENSE_CATEGORIES: Array<{
  name: string;
  description: string;
  type: 'OPERATING' | 'INVESTMENT' | 'OTHER';
}> = [
  { name: 'Thuê mặt bằng', description: 'Tiền thuê phòng khám', type: 'OPERATING' },
  { name: 'Điện nước', description: 'Hóa đơn điện, nước hàng tháng', type: 'OPERATING' },
  {
    name: 'Internet & điện thoại',
    description: 'Cước internet, điện thoại, tổng đài',
    type: 'OPERATING',
  },
  { name: 'Lương & phụ cấp', description: 'Lương, thưởng, phụ cấp nhân viên', type: 'OPERATING' },
  { name: 'Bảo hiểm xã hội', description: 'BHXH, BHYT, BHTN phần doanh nghiệp', type: 'OPERATING' },
  { name: 'Vật tư tiêu hao', description: 'Vật tư dùng trong điều trị', type: 'OPERATING' },
  { name: 'Thuốc', description: 'Thuốc tê, thuốc kê đơn nhập kho', type: 'OPERATING' },
  {
    name: 'Labo phục hình',
    description: 'Chi phí gia công răng sứ, hàm tháo lắp',
    type: 'OPERATING',
  },
  {
    name: 'Marketing & quảng cáo',
    description: 'Quảng cáo online, in ấn, sự kiện',
    type: 'OPERATING',
  },
  {
    name: 'Bảo trì thiết bị',
    description: 'Bảo trì ghế nha, máy nén khí, máy X-quang',
    type: 'OPERATING',
  },
  {
    name: 'Vệ sinh & rác thải y tế',
    description: 'Vệ sinh, thu gom rác thải y tế',
    type: 'OPERATING',
  },
  { name: 'Văn phòng phẩm', description: 'Giấy in, sổ sách, mực in', type: 'OPERATING' },
  { name: 'Phí ngân hàng & POS', description: 'Phí chuyển khoản, phí quẹt thẻ', type: 'OPERATING' },
  { name: 'Thuế & lệ phí', description: 'Thuế môn bài, phí giấy phép', type: 'OPERATING' },
  { name: 'Đào tạo', description: 'Hội thảo, khóa học chuyên môn', type: 'OPERATING' },
  {
    name: 'Mua sắm thiết bị',
    description: 'Ghế nha, máy móc, dụng cụ lâu bền',
    type: 'INVESTMENT',
  },
  { name: 'Sửa chữa & cải tạo', description: 'Cải tạo, sửa chữa cơ sở', type: 'INVESTMENT' },
  { name: 'Chi phí khác', description: 'Khoản chi chưa phân loại', type: 'OTHER' },
];
