import { APPROVED_PATIENT_CONSENT_TEXT, getConsentNotices, recordConsent } from './consent-record';

describe('consent records', () => {
  it('uses the existing VI/EN booking wording and the approved patient wording', () => {
    expect(getConsentNotices()).toEqual({
      booking: {
        purpose: 'BOOKING_REQUEST',
        version: '1',
        text: 'Tôi đồng ý với chính sách bảo mật và cho phép phòng khám liên hệ về yêu cầu đặt lịch.',
      },
      intake: { purpose: 'PATIENT_INTAKE', version: 'C3-v1', text: APPROVED_PATIENT_CONSENT_TEXT },
      desk: {
        purpose: 'PATIENT_DATA_PROCESSING',
        version: 'C3-v1',
        text: APPROVED_PATIENT_CONSENT_TEXT,
      },
    });
    expect(getConsentNotices('en').booking.text).toBe(
      'I agree to the privacy policy and allow the clinic to contact me about this booking request.',
    );
  });

  it('shares the exact approved C3-v1 text for intake and desk in either language', () => {
    const approved =
      'Tôi đồng ý để phòng khám thu thập và lưu thông tin sức khỏe tôi cung cấp trong hồ sơ bệnh nhân, cho nhân viên tiếp nhận và bác sĩ phụ trách sử dụng để chuẩn bị và thực hiện buổi khám. Tôi có thể liên hệ lễ tân để yêu cầu rút lại sự đồng ý này.';
    expect(APPROVED_PATIENT_CONSENT_TEXT).toBe(approved);
    for (const language of ['vi', 'en'] as const) {
      const notices = getConsentNotices(language);
      expect(notices.intake).toEqual({
        purpose: 'PATIENT_INTAKE',
        version: 'C3-v1',
        text: approved,
      });
      expect(notices.desk).toEqual({
        purpose: 'PATIENT_DATA_PROCESSING',
        version: 'C3-v1',
        text: approved,
      });
    }
  });

  function database() {
    const rows = new Map<string, any>();
    return {
      consentRecord: {
        createMany: jest.fn(async ({ data }) => {
          if (!rows.has(data.idempotencyKey))
            rows.set(data.idempotencyKey, { id: 'record', withdrawnAt: null, ...data });
          return { count: 1 };
        }),
        findUniqueOrThrow: jest.fn(async ({ where }) => rows.get(where.idempotencyKey)),
      },
    };
  }

  it('records once on concurrent retries and never resurrects withdrawn consent', async () => {
    const tx = database();
    const input = {
      channel: 'ONLINE' as const,
      bookingRequestId: 'booking',
      notice: getConsentNotices().booking,
      ip: '192.168.1.123',
    };
    const [first, retry] = await Promise.all([
      recordConsent(tx as any, input),
      recordConsent(tx as any, input),
    ]);
    expect(first).toBe(retry);
    expect(first).toMatchObject({
      channel: 'ONLINE',
      bookingRequestId: 'booking',
      text: input.notice.text,
      ipPrefix: '192.168.1.0/24',
    });
    first.withdrawnAt = new Date();
    expect((await recordConsent(tx as any, input)).withdrawnAt).toBe(first.withdrawnAt);
    expect(tx.consentRecord.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it.each([
    ['2001:db8:abcd:1234::99', '2001:db8:abcd::/48'],
    ['::1', '0:0:0::/48'],
    ['::ffff:192.168.1.123', '192.168.1.0/24'],
    ['::ffff:c0a8:17b', '192.168.1.0/24'],
    ['not an IP', null],
  ])('shortens IP %s', async (ip, ipPrefix) => {
    const row = await recordConsent(database() as any, {
      channel: 'DESK',
      patientId: 'patient',
      notice: getConsentNotices().booking,
      ip,
    });
    expect(row.ipPrefix).toBe(ipPrefix);
  });

  it.each([
    { channel: 'ONLINE', patientId: 'patient' },
    { channel: 'INTAKE', patientId: 'patient' },
    { channel: 'DESK', bookingRequestId: 'booking' },
  ])('rejects missing source identity: %s', async input => {
    const tx = database();
    await expect(
      recordConsent(tx as any, { ...input, notice: getConsentNotices().booking } as any),
    ).rejects.toThrow();
    expect(tx.consentRecord.createMany).not.toHaveBeenCalled();
  });
});
