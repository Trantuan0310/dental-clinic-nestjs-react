-- BR-BILL-025: a discount above 50% of the invoice subtotal becomes its own
-- permission, held by the clinic admin only. The route still requires
-- invoice.update (the front desk keeps smaller discounts); every discount
-- change is also written to the system audit log (INVOICE_DISCOUNT_UPDATED).
-- seed.ts holds the same grant, so fresh and upgraded databases match.
BEGIN;

INSERT INTO permissions (code, resource, action, description) VALUES
  ('invoice.discount.large', 'invoice', 'discount.large',
   'Giảm giá trên 50% tổng hóa đơn (có lý do, ghi nhật ký)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'invoice.discount.large'
WHERE r.code = 'clinic_admin'
ON CONFLICT DO NOTHING;
COMMIT;
