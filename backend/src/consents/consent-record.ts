import { BadRequestException } from '@nestjs/common';
import { ConsentChannel, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { isIP } from 'net';

export interface ConsentNotice {
  purpose: string;
  version: string;
  text: string;
}

export const APPROVED_PATIENT_CONSENT_TEXT =
  'Tôi đồng ý để phòng khám thu thập và lưu thông tin sức khỏe tôi cung cấp trong hồ sơ bệnh nhân, cho nhân viên tiếp nhận và bác sĩ phụ trách sử dụng để chuẩn bị và thực hiện buổi khám. Tôi có thể liên hệ lễ tân để yêu cầu rút lại sự đồng ý này.';

export function getConsentNotices(language: 'vi' | 'en' = 'vi') {
  return {
    booking: {
      purpose: 'BOOKING_REQUEST',
      version: '1',
      text:
        language === 'en'
          ? 'I agree to the privacy policy and allow the clinic to contact me about this booking request.'
          : 'Tôi đồng ý với chính sách bảo mật và cho phép phòng khám liên hệ về yêu cầu đặt lịch.',
    },
    intake: { purpose: 'PATIENT_INTAKE', version: 'C3-v1', text: APPROVED_PATIENT_CONSENT_TEXT },
    desk: {
      purpose: 'PATIENT_DATA_PROCESSING',
      version: 'C3-v1',
      text: APPROVED_PATIENT_CONSENT_TEXT,
    },
  };
}

function shortenIp(ip?: string): string | null {
  if (!ip || !isIP(ip)) return null;
  if (isIP(ip) === 4) return ip.split('.').slice(0, 3).join('.') + '.0/24';
  // URL normalizes compressed and IPv4-mapped IPv6 before shortening.
  const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [left, right] = normalized.split('::');
  const head = left ? left.split(':') : [];
  const tail = right ? right.split(':') : [];
  const parts =
    right === undefined
      ? head
      : [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail];
  if (parts.slice(0, 5).every(p => Number.parseInt(p, 16) === 0) && parts[5] === 'ffff') {
    const high = Number.parseInt(parts[6], 16);
    const low = Number.parseInt(parts[7], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.0/24`;
  }
  return parts.slice(0, 3).join(':') + '::/48';
}

export async function recordConsent(
  tx: Prisma.TransactionClient,
  input: {
    channel: 'ONLINE' | 'INTAKE' | 'DESK';
    patientId?: string;
    bookingRequestId?: string;
    appointmentId?: string;
    notice: ConsentNotice;
    ip?: string;
    actorId?: string;
  },
) {
  const { channel, patientId, bookingRequestId, appointmentId, notice, actorId } = input;
  const subject =
    channel === 'ONLINE' ? bookingRequestId : channel === 'INTAKE' ? appointmentId : patientId;
  if (
    !Object.values(ConsentChannel).includes(channel) ||
    !subject ||
    (channel !== 'ONLINE' && !patientId)
  ) {
    throw new BadRequestException('Consent requires the channel source and patient identity');
  }
  if (
    !notice?.purpose?.trim() ||
    !notice.version?.trim() ||
    !notice.text?.trim() ||
    notice.purpose.length > 100 ||
    notice.version.length > 100
  ) {
    throw new BadRequestException('A versioned consent notice is required');
  }
  const idempotencyKey = createHash('sha256')
    .update(JSON.stringify([channel, subject, notice.purpose, notice.version]))
    .digest('hex');
  // ON CONFLICT DO NOTHING remains safe inside the caller's open transaction.
  await tx.consentRecord.createMany({
    data: {
      idempotencyKey,
      channel,
      patientId,
      bookingRequestId,
      appointmentId,
      ...notice,
      actorId,
      ipPrefix: shortenIp(input.ip),
    },
    skipDuplicates: true,
  });
  return tx.consentRecord.findUniqueOrThrow({ where: { idempotencyKey } });
}
