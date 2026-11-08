import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

export const appointmentLinkHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** The shared A1/A3 trust boundary; never return the token or unrelated patient data. */
export async function resolveAppointmentLink(tx: Prisma.TransactionClient, token: string) {
  const denied = () => new NotFoundException('Liên kết không hợp lệ hoặc đã hết hạn');
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw denied();
  const link = await tx.appointmentLink.findUnique({
    where: { tokenHash: appointmentLinkHash(token) },
    include: { appointment: { include: { patient: { select: { deletedAt: true } } } } },
  });
  const now = new Date();
  const appt = link?.appointment;
  if (!link || !appt || link.expiresAt <= now || appt.startAt <= now ||
      appt.deletedAt || appt.patient.deletedAt ||
      !['SCHEDULED', 'CONFIRMED'].includes(appt.status)) throw denied();
  await tx.appointmentLink.update({ where: { id: link.id }, data: { lastUsedAt: now } });
  const { patient: _patient, ...appointment } = appt;
  return appointment;
}

/** Kept separate from delivery so only a SHA-256 hash reaches the database. */
export async function issueAppointmentLink(tx: Prisma.TransactionClient, appointmentId: string) {
  const appt = await tx.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.deletedAt || appt.startAt <= new Date() ||
      !['SCHEDULED', 'CONFIRMED'].includes(appt.status)) return null;
  const token = randomBytes(32).toString('base64url');
  await tx.appointmentLink.create({ data: {
    appointmentId, tokenHash: appointmentLinkHash(token), expiresAt: appt.startAt,
  } });
  return token;
}
