import { EmailService, emailConfigProblem } from './email.service';

describe('EmailService', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  const message = { to: 'a@clinic.local', subject: 'Test', html: '<p>x</p>' };

  it('treats a mocked email as delivered in development (the log is the delivery)', async () => {
    process.env.EMAIL_MOCK = 'true';
    process.env.NODE_ENV = 'development';
    await expect(new EmailService().send(message)).resolves.toBe(true);
  });

  it('reports a mocked email as NOT sent in production', async () => {
    process.env.EMAIL_MOCK = 'true';
    process.env.NODE_ENV = 'production';
    await expect(new EmailService().send(message)).resolves.toBe(false);
  });

  it('reports NOT sent when SMTP is not configured', async () => {
    process.env.EMAIL_MOCK = 'false';
    delete process.env.SMTP_HOST;
    await expect(new EmailService().send(message)).resolves.toBe(false);
  });
});

describe('emailConfigProblem', () => {
  const smtp = { SMTP_HOST: 'smtp.x', SMTP_USER: 'u', SMTP_PASS: 'p' };

  it('is silent outside production', () => {
    expect(emailConfigProblem({ NODE_ENV: 'development', EMAIL_MOCK: 'true' })).toBeNull();
  });

  it('warns when production still runs on EMAIL_MOCK=true', () => {
    expect(emailConfigProblem({ NODE_ENV: 'production', EMAIL_MOCK: 'true', ...smtp })).toMatch(
      /EMAIL_MOCK=true/,
    );
  });

  it('warns when production has no SMTP settings', () => {
    expect(emailConfigProblem({ NODE_ENV: 'production', EMAIL_MOCK: 'false' })).toMatch(/SMTP/);
  });

  it('is silent when production email is configured', () => {
    expect(emailConfigProblem({ NODE_ENV: 'production', EMAIL_MOCK: 'false', ...smtp })).toBeNull();
  });
});
