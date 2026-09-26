/**
 * Opening-day service catalogue for a mid-range city clinic (Hà Nội / TP.HCM
 * private practice, 2026 prices in VND). Every row is a starting point the
 * admin edits on the Dịch vụ screen; the setup script only inserts codes that
 * do not exist yet, so edited prices are never overwritten.
 *
 * Durations and buffers are in minutes (multiples of 5, as the catalogue
 * requires). `specialty` is the dentist specialty a service needs; services
 * without one are assigned to every dentist.
 */
export type Specialty =
  | 'TONG_QUAT'
  | 'NHA_CHU'
  | 'NOI_NHA'
  | 'CHINH_NHA'
  | 'NHO_RANG'
  | 'PHUC_HINH'
  | 'IMPLANT'
  | 'NHA_TRE_EM'
  | 'THAM_MY';

export const SERVICE_CATEGORIES = [
  { code: 'KHAM', name: 'Khám & chẩn đoán', sortOrder: 10 },
  { code: 'DU_PHONG', name: 'Dự phòng & nha chu', sortOrder: 20 },
  { code: 'DIEU_TRI', name: 'Điều trị bảo tồn', sortOrder: 30 },
  { code: 'NOI_NHA', name: 'Nội nha (điều trị tủy)', sortOrder: 40 },
  { code: 'PHAU_THUAT', name: 'Tiểu phẫu', sortOrder: 50 },
  { code: 'PHUC_HINH', name: 'Phục hình', sortOrder: 60 },
  { code: 'IMPLANT', name: 'Implant', sortOrder: 70 },
  { code: 'CHINH_NHA', name: 'Chỉnh nha', sortOrder: 80 },
  { code: 'THAM_MY', name: 'Thẩm mỹ', sortOrder: 90 },
  { code: 'NHA_TRE_EM', name: 'Nha khoa trẻ em', sortOrder: 100 },
];

export interface ServiceRow {
  code: string;
  category: string;
  name: string;
  minutes: number;
  before: number;
  after: number;
  price: number;
  specialty: Specialty | null;
}

const row = (
  code: string,
  category: string,
  name: string,
  minutes: number,
  before: number,
  after: number,
  price: number,
  specialty: Specialty | null = null,
): ServiceRow => ({ code, category, name, minutes, before, after, price, specialty });

export const SERVICES: ServiceRow[] = [
  // Khám & chẩn đoán
  row('KHAM_TQ', 'KHAM', 'Khám tổng quát & tư vấn', 15, 0, 5, 0),
  row('KHAM_CAP_CUU', 'KHAM', 'Khám cấp cứu (đau, sưng)', 20, 0, 5, 150_000),
  row('TAI_KHAM', 'KHAM', 'Tái khám sau điều trị', 15, 0, 5, 0),
  row('CHUP_XQ', 'KHAM', 'Chụp X-quang quanh chóp', 10, 0, 0, 100_000),
  row('CHUP_PANO', 'KHAM', 'Chụp phim toàn cảnh (Panorama)', 15, 0, 0, 250_000),
  row('CHUP_CT', 'KHAM', 'Chụp CT Cone Beam', 20, 0, 0, 700_000),

  // Dự phòng & nha chu
  row('CAO_VOI', 'DU_PHONG', 'Cạo vôi + đánh bóng', 30, 0, 10, 400_000),
  row('DANH_BONG', 'DU_PHONG', 'Đánh bóng răng', 20, 0, 5, 200_000),
  row('BOI_FLUOR', 'DU_PHONG', 'Bôi fluor phòng sâu răng', 15, 0, 5, 200_000),
  row('TRAM_BIT_HO_RANH', 'DU_PHONG', 'Trám bít hố rãnh (1 răng)', 20, 0, 5, 250_000),
  row(
    'CAO_VOI_SAU',
    'DU_PHONG',
    'Cạo vôi sâu, xử lý túi nha chu (1 hàm)',
    45,
    0,
    10,
    1_000_000,
    'NHA_CHU',
  ),
  row(
    'DIEU_TRI_NHA_CHU',
    'DU_PHONG',
    'Điều trị viêm nha chu (1 lần hẹn)',
    45,
    0,
    10,
    800_000,
    'NHA_CHU',
  ),

  // Điều trị bảo tồn
  row('TRAM_COMPOSITE', 'DIEU_TRI', 'Trám răng composite', 30, 0, 10, 500_000),
  row(
    'TRAM_COMPOSITE_LON',
    'DIEU_TRI',
    'Trám composite xoang lớn / tái tạo thân răng',
    45,
    0,
    10,
    800_000,
  ),
  row('TRAM_GIC', 'DIEU_TRI', 'Trám GIC', 20, 0, 5, 300_000),
  row('TRAM_CO_RANG', 'DIEU_TRI', 'Trám cổ răng mòn', 30, 0, 10, 400_000),
  row('DIEU_TRI_E_BUOT', 'DIEU_TRI', 'Điều trị ê buốt răng', 20, 0, 5, 300_000),

  // Nội nha
  row('TUY_RANG_CUA', 'NOI_NHA', 'Điều trị tủy răng cửa', 60, 0, 10, 1_200_000, 'NOI_NHA'),
  row('TUY_TIEN_HAM', 'NOI_NHA', 'Điều trị tủy răng tiền hàm', 60, 0, 10, 1_600_000, 'NOI_NHA'),
  row('TUY_RANG_HAM', 'NOI_NHA', 'Điều trị tủy răng hàm', 90, 0, 10, 2_200_000, 'NOI_NHA'),
  row('TUY_LAI', 'NOI_NHA', 'Điều trị tủy lại', 90, 0, 10, 2_800_000, 'NOI_NHA'),
  row('CHOT_TAI_TAO_CUI', 'NOI_NHA', 'Đặt chốt sợi, tái tạo cùi', 30, 0, 10, 700_000),

  // Tiểu phẫu
  row('NHO_RANG_SUA', 'PHAU_THUAT', 'Nhổ răng sữa', 15, 0, 5, 100_000),
  row('NHO_RANG', 'PHAU_THUAT', 'Nhổ răng thường', 30, 5, 15, 500_000),
  row('NHO_RANG_KHO', 'PHAU_THUAT', 'Nhổ răng khó / nhiều chân', 45, 5, 15, 1_200_000, 'NHO_RANG'),
  row('NHO_RANG_KHON', 'PHAU_THUAT', 'Nhổ răng khôn hàm trên', 45, 10, 20, 1_500_000, 'NHO_RANG'),
  row(
    'NHO_RANG_KHON_NGAM',
    'PHAU_THUAT',
    'Nhổ răng khôn mọc lệch / ngầm',
    60,
    10,
    20,
    3_000_000,
    'NHO_RANG',
  ),
  row('CAT_LOI', 'PHAU_THUAT', 'Cắt lợi trùm, tạo hình nướu', 30, 5, 10, 1_000_000),

  // Phục hình
  row('MAO_SU_KIM_LOAI', 'PHUC_HINH', 'Mão sứ kim loại', 60, 0, 10, 1_500_000, 'PHUC_HINH'),
  row('MAO_SU_TITAN', 'PHUC_HINH', 'Mão sứ Titan', 60, 0, 10, 2_500_000, 'PHUC_HINH'),
  row('MAO_SU_ZIRCONIA', 'PHUC_HINH', 'Mão toàn sứ Zirconia', 60, 0, 10, 4_500_000, 'PHUC_HINH'),
  row(
    'MAO_SU_CAO_CAP',
    'PHUC_HINH',
    'Mão toàn sứ cao cấp (Emax / Lava)',
    60,
    0,
    10,
    7_000_000,
    'PHUC_HINH',
  ),
  row('MAT_DAN_SU', 'PHUC_HINH', 'Mặt dán sứ Veneer', 60, 0, 10, 7_000_000, 'PHUC_HINH'),
  row('INLAY_ONLAY', 'PHUC_HINH', 'Inlay / Onlay sứ', 45, 0, 10, 3_500_000, 'PHUC_HINH'),
  row('HAM_THAO_LAP', 'PHUC_HINH', 'Hàm tháo lắp nhựa (1 hàm)', 45, 0, 10, 4_000_000, 'PHUC_HINH'),
  row('THAO_MAO_CU', 'PHUC_HINH', 'Tháo mão / cầu răng cũ', 20, 0, 5, 300_000),

  // Implant
  row('IMPLANT_TU_VAN', 'IMPLANT', 'Tư vấn & lập kế hoạch Implant', 30, 0, 5, 0, 'IMPLANT'),
  row(
    'IMPLANT_HAN_QUOC',
    'IMPLANT',
    'Cấy Implant Hàn Quốc (1 trụ)',
    90,
    15,
    30,
    15_000_000,
    'IMPLANT',
  ),
  row(
    'IMPLANT_CAO_CAP',
    'IMPLANT',
    'Cấy Implant cao cấp Thụy Sĩ / Mỹ (1 trụ)',
    90,
    15,
    30,
    28_000_000,
    'IMPLANT',
  ),
  row('GHEP_XUONG', 'IMPLANT', 'Ghép xương', 60, 10, 20, 6_000_000, 'IMPLANT'),
  row('NANG_XOANG', 'IMPLANT', 'Nâng xoang', 90, 15, 30, 12_000_000, 'IMPLANT'),
  row('MAO_TREN_IMPLANT', 'IMPLANT', 'Mão sứ trên Implant', 60, 0, 10, 5_000_000, 'IMPLANT'),

  // Chỉnh nha (giá gói trọn liệu trình; tái khám thường đã gồm trong gói)
  row(
    'CN_TU_VAN',
    'CHINH_NHA',
    'Tư vấn chỉnh nha, lấy dấu, phân tích phim',
    45,
    0,
    10,
    500_000,
    'CHINH_NHA',
  ),
  row(
    'CN_MAC_CAI_KIM_LOAI',
    'CHINH_NHA',
    'Chỉnh nha mắc cài kim loại (trọn gói)',
    90,
    0,
    10,
    30_000_000,
    'CHINH_NHA',
  ),
  row(
    'CN_MAC_CAI_SU',
    'CHINH_NHA',
    'Chỉnh nha mắc cài sứ (trọn gói)',
    90,
    0,
    10,
    40_000_000,
    'CHINH_NHA',
  ),
  row(
    'CN_KHAY_TRONG',
    'CHINH_NHA',
    'Chỉnh nha khay trong suốt (trọn gói)',
    60,
    0,
    10,
    70_000_000,
    'CHINH_NHA',
  ),
  row('CN_TAI_KHAM', 'CHINH_NHA', 'Tái khám chỉnh nha, siết dây', 30, 0, 10, 0, 'CHINH_NHA'),
  row(
    'CN_HAM_DUY_TRI',
    'CHINH_NHA',
    'Hàm duy trì sau chỉnh nha',
    30,
    0,
    10,
    1_500_000,
    'CHINH_NHA',
  ),

  // Thẩm mỹ
  row('TAY_TRANG_PHONG_KHAM', 'THAM_MY', 'Tẩy trắng răng tại phòng khám', 60, 0, 10, 2_500_000),
  row('TAY_TRANG_TAI_NHA', 'THAM_MY', 'Máng tẩy trắng tại nhà', 30, 0, 5, 1_500_000),
  row('DINH_DA', 'THAM_MY', 'Đính đá răng', 20, 0, 5, 500_000),

  // Nha khoa trẻ em
  row('TE_KHAM', 'NHA_TRE_EM', 'Khám răng trẻ em', 15, 0, 5, 0),
  row('TE_TRAM_RANG_SUA', 'NHA_TRE_EM', 'Trám răng sữa', 20, 0, 5, 250_000),
  row('TE_TUY_RANG_SUA', 'NHA_TRE_EM', 'Điều trị tủy răng sữa', 45, 0, 10, 700_000, 'NHA_TRE_EM'),
  row('TE_VECNI_FLUOR', 'NHA_TRE_EM', 'Bôi vecni fluor trẻ em', 15, 0, 5, 200_000),
];
