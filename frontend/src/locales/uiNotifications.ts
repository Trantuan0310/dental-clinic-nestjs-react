export const vi = {
  title: 'Thông báo',
  subtitle: 'Việc đang chờ bạn xử lý',
  open: 'Mở thông báo',
  openWithCount: 'Thông báo: {{count}} việc đang chờ',
  emptyTitle: 'Không có việc nào đang chờ',
  emptyHint: 'Mọi thứ đã được xử lý. Danh sách tự cập nhật mỗi phút.',
  loadError: 'Không tải được thông báo',
  items: {
    bookingRequests: { title: 'Yêu cầu đặt lịch online', hint: 'Cần xác nhận, đề xuất giờ khác hoặc từ chối' },
    shiftApprovals: { title: 'Đăng ký ca chờ duyệt', hint: 'Bác sĩ đăng ký ca làm việc sắp tới' },
    recallsDue: { title: 'Bệnh nhân cần gọi tái khám', hint: 'Đến hạn hôm nay hoặc đã tới ngày hẹn gọi lại' },
    draftInvoices: { title: 'Hoá đơn nháp chưa phát hành', hint: 'Phiên khám đã đóng nhưng chưa xuất hoá đơn' },
    staleEncounters: { title: 'Phiên khám chưa đóng', hint: 'Mở từ hôm trước, cần đóng hoặc huỷ' },
    lowStock: { title: 'Vật tư sắp hết', hint: 'Tồn kho bằng hoặc dưới mức tối thiểu' },
  },
};

export const en: typeof vi = {
  title: 'Notifications',
  subtitle: 'Waiting on you',
  open: 'Open notifications',
  openWithCount: 'Notifications: {{count}} items waiting',
  emptyTitle: 'Nothing waiting',
  emptyHint: 'All caught up. The list refreshes every minute.',
  loadError: 'Could not load notifications',
  items: {
    bookingRequests: { title: 'Online booking requests', hint: 'To confirm, propose another time or decline' },
    shiftApprovals: { title: 'Shift registrations to approve', hint: 'Upcoming shifts dentists signed up for' },
    recallsDue: { title: 'Patients to call for a recall', hint: 'Due today or call-back date reached' },
    draftInvoices: { title: 'Draft invoices not issued', hint: 'Closed visits not billed yet' },
    staleEncounters: { title: 'Encounters still open', hint: 'Opened on an earlier day; close or cancel them' },
    lowStock: { title: 'Low-stock items', hint: 'At or below their minimum level' },
  },
};
