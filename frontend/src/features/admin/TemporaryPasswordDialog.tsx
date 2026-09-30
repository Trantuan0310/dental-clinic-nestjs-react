import { useState } from 'react';
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
      notify.success('Đã sao chép mật khẩu tạm');
    } catch {
      notify.error('Không sao chép được, hãy chép tay.');
    }
  };

  return (
    <Modal
      open={!!user}
      onClose={close}
      title={password ? 'Mật khẩu tạm' : 'Cấp mật khẩu tạm'}
      size="md"
    >
      {user && (
        <div className="space-y-4 text-sm">
          {emailFailed && !password && (
            <Alert type="warning" title="Chưa gửi được email">
              Máy chủ chưa gửi được email tới {user.email} (email chưa được cấu hình hoặc gửi lỗi).
              Dùng “Cấp mật khẩu tạm” rồi đưa mật khẩu cho người dùng trực tiếp.
            </Alert>
          )}
          {password ? (
            <>
              <p className="text-gray-700 dark:text-surface-200">
                Mật khẩu tạm của <strong>{user.email}</strong>. Mật khẩu chỉ hiện <strong>một lần</strong>;
                hãy đưa trực tiếp cho người dùng, không gửi qua kênh công khai.
              </p>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 select-all rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-base dark:border-surface-700 dark:bg-surface-800"
                  aria-label="Mật khẩu tạm"
                >
                  {password}
                </code>
                <Button type="button" variant="outline" onClick={copy} aria-label="Sao chép mật khẩu tạm">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-gray-500 dark:text-surface-400">
                Người dùng đăng nhập bằng mật khẩu này rồi đổi mật khẩu ở “Tài khoản của tôi”; tài
                khoản chuyển từ “Chờ thiết lập” sang “Hoạt động” khi đổi xong.
              </p>
              <div className="flex justify-end">
                <Button onClick={close}>Đã ghi lại</Button>
              </div>
            </>
          ) : canIssue ? (
            <>
              <p className="text-gray-600 dark:text-surface-300">
                Tạo mật khẩu tạm cho <strong>{user.email}</strong>. Mật khẩu cũ (nếu có) và mọi phiên
                đăng nhập của tài khoản này sẽ hết hiệu lực.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Để sau
                </Button>
                <Button
                  isLoading={issue.isPending}
                  onClick={() =>
                    issue.mutate(user.id, {
                      onSuccess: (result) => {
                        if (result.temporaryPassword) setPassword(result.temporaryPassword);
                        else notify.error('Máy chủ không trả về mật khẩu tạm.');
                      },
                      onError: (e) =>
                        notify.error(getApiErrorMessage(e, 'Không cấp được mật khẩu tạm')),
                    })
                  }
                >
                  Cấp mật khẩu tạm
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-600 dark:text-surface-300">
                Nhờ quản trị viên cấp mật khẩu tạm cho {user.email} ở trang Người dùng.
              </p>
              <div className="flex justify-end">
                <Button onClick={close}>Đóng</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
