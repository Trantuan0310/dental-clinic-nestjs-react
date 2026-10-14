import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy } from 'lucide-react';
import { Alert, Button, Modal } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';
import { useIssueTemporaryPassword } from './adminApi';

/**
 * "Cấp mật khẩu tạm": for when the invite / reset email cannot be delivered.
 * The password is shown once, here only; the user signs in with it and then
 * chooses their own in "Tài khoản của tôi", which activates the account.
 */
export function TemporaryPasswordDialog({
  user,
  emailFailed = false,
  onClose,
}: {
  user: { id: string; email: string; fullName?: string } | null;
  /** Opened because an invite/reset email could not be sent. */
  emailFailed?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const canIssue = useAuthStore((s) => s.hasPermission('user.reset_password'));
  const issue = useIssueTemporaryPassword();
  const [password, setPassword] = useState<string | null>(null);

  const close = () => {
    setPassword(null);
    issue.reset();
    onClose();
  };

  const copy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      notify.success(t('uiWorkforce.temporaryPassword.copied'));
    } catch {
      notify.error(t('uiWorkforce.temporaryPassword.copyFailed'));
    }
  };

  return (
    <Modal
      open={!!user}
      onClose={close}
      title={password ? t('uiWorkforce.temporaryPassword.titleShown') : t('uiWorkforce.temporaryPassword.titleIssue')}
      size="md"
    >
      {user && (
        <div className="space-y-4 text-sm">
          {emailFailed && !password && (
            <Alert type="warning" title={t('uiWorkforce.temporaryPassword.emailFailedTitle')}>
              {t('uiWorkforce.temporaryPassword.emailFailedMessage', { email: user.email })}
            </Alert>
          )}
          {password ? (
            <>
              <p className="text-gray-700 dark:text-surface-200">
                {t('uiWorkforce.temporaryPassword.shownMessage', { email: user.email })}
              </p>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <code
                  className="min-w-0 flex-1 select-all break-all rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-base text-gray-900 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
                  aria-label={t('uiWorkforce.temporaryPassword.passwordLabel')}
                >
                  {password}
                </code>
                <Button type="button" variant="outline" onClick={copy} aria-label={t('uiWorkforce.temporaryPassword.copyPassword')}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-gray-500 dark:text-surface-400">
                {t('uiWorkforce.temporaryPassword.nextSteps')}
              </p>
              <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                <Button onClick={close}>{t('uiWorkforce.temporaryPassword.done')}</Button>
              </div>
            </>
          ) : canIssue ? (
            <>
              <p className="text-gray-600 dark:text-surface-300">
                {t('uiWorkforce.temporaryPassword.issueDescription', { email: user.email })}
              </p>
              <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={close}>
                  {t('uiWorkforce.temporaryPassword.later')}
                </Button>
                <Button
                  isLoading={issue.isPending}
                  onClick={() =>
                    issue.mutate(user.id, {
                      onSuccess: (result) => {
                        if (result.temporaryPassword) setPassword(result.temporaryPassword);
                        else notify.error(t('uiWorkforce.temporaryPassword.missingPassword'));
                      },
                      onError: (e) =>
                        notify.error(getApiErrorMessage(e, t('uiWorkforce.temporaryPassword.issueError'))),
                    })
                  }
                >
                  {t('uiWorkforce.temporaryPassword.issueAction')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-600 dark:text-surface-300">
                {t('uiWorkforce.temporaryPassword.noPermission', { email: user.email })}
              </p>
              <div className="flex justify-end">
                <Button onClick={close}>{t('uiWorkforce.temporaryPassword.close')}</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
