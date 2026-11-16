"""Sinh sơ đồ ERD (PlantUML) cho từng nhóm bảng từ backend/prisma/schema.prisma.

    python3 sinh-erd.py      # ghi so-do/3-*-erd-*.puml

Mỗi bảng hiện khóa chính, khóa ngoại và các cột nghiệp vụ chính (bỏ cột
kỹ thuật như created_by, updated_at); quan hệ vẽ theo khóa ngoại thật.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA = os.path.join(HERE, '../../../backend/prisma/schema.prisma')

GROUPS = {
    '3-2-erd-benh-nhan-lich-hen': ('Nhóm bệnh nhân, lịch hẹn và tiếp nhận', [
        'Patient', 'Appointment', 'AppointmentService', 'Service', 'BookingRequest', 'QueueEntry',
        'WorkingSchedule', 'AppointmentLink', 'PatientHistoryLink', 'WaitlistEntry', 'Recall', 'User']),
    '3-3-erd-kham-dieu-tri': ('Nhóm phiên khám, ghi chú lâm sàng và đơn thuốc', [
        'Patient', 'Appointment', 'Encounter', 'ClinicalNote', 'ClinicalNoteAddendum',
        'Prescription', 'PrescriptionLine', 'DentalChartSnapshot']),
    '3-3-erd-dieu-tri-ke-hoach': ('Nhóm điều trị và kế hoạch điều trị', [
        'Patient', 'Encounter', 'Treatment', 'TreatmentInventoryUsage', 'InventoryItem',
        'TreatmentPlan', 'TreatmentPlanItem']),
    '3-4-erd-hoa-don': ('Nhóm hóa đơn và thanh toán', [
        'Patient', 'Encounter', 'Invoice', 'InvoiceItem', 'Payment', 'InvoiceAdjustment', 'BankTransaction',
        'Treatment']),
    '3-5-erd-nguoi-dung-phan-quyen': ('Nhóm người dùng, phân quyền và nhật ký', [
        'User', 'Role', 'Permission', 'UserRole', 'RolePermission', 'AuditLog']),
    '3-5-erd-nhan-su-kho': ('Nhóm nhân sự, lương và kho', [
        'User', 'Employee', 'DentistProfile', 'ShiftRegistration', 'PayrollPeriod', 'PayrollLineItem',
        'InventoryCategory', 'InventoryItem', 'StockMovement']),
}
SKIP_COLS = {'createdBy', 'updatedBy', 'updatedAt', 'deletedBy', 'lastEditedBy'}
MAX_COLS = 5


def parse():
    text = open(SCHEMA).read()
    models = {}
    for m in re.finditer(r'^model (\w+) \{(.*?)^\}', text, re.S | re.M):
        name, body = m.group(1), m.group(2)
        table = re.search(r'@@map\("([^"]+)"\)', body)
        cols, rels = [], []
        for line in body.splitlines():
            line = line.strip()
            if not line or line.startswith('//') or line.startswith('@@'):
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            field, typ = parts[0], parts[1]
            base = typ.rstrip('?[]')
            if '@relation' in line and 'fields:' in line:
                fk = re.search(r'fields:\s*\[([^\]]+)\]', line).group(1).split(',')[0].strip()
                rels.append((fk, base))
                continue
            if base[0].isupper() and base not in ('String', 'Int', 'Boolean', 'DateTime', 'Decimal', 'Json', 'BigInt', 'Float', 'Bytes'):
                # Enum or back-relation. Back-relations (lists, models) are not columns.
                if typ.endswith('[]') or base in [x for x in re.findall(r'^model (\w+)', text, re.M)]:
                    continue
            col = re.search(r'@map\("([^"]+)"\)', line)
            if '@db.Uuid' in line:
                base = 'Uuid'
            cols.append({'field': field, 'col': col.group(1) if col else field, 'type': base,
                         'pk': '@id' in line, 'unique': '@unique' in line, 'opt': typ.endswith('?')})
        models[name] = {'table': table.group(1) if table else name, 'cols': cols, 'rels': rels}
    return models


SQL = {'Uuid': 'uuid', 'String': 'varchar', 'Int': 'int', 'Boolean': 'bool', 'DateTime': 'timestamptz', 'Decimal': 'decimal',
       'Json': 'jsonb', 'BigInt': 'bigint', 'Float': 'float'}


def emit(name, title, wanted, models):
    lines = ['@startuml', '!include _kieu.iuml', 'hide circle', 'skinparam linetype ortho',
             'skinparam defaultFontSize 13', f'title {title}', '']
    if name in ('3-2-erd-benh-nhan-lich-hen', '3-5-erd-nhan-su-kho'):  # sơ đồ rộng: xếp dọc để chữ đủ to khi in
        lines.insert(4, 'left to right direction')
    for mname in wanted:
        m = models[mname]
        fks = {fk for fk, _ in m['rels']}
        lines.append(f'entity "{m["table"]}" as {mname} {{')
        pk = [c for c in m['cols'] if c['pk']]
        for c in pk:
            lines.append(f'  * {c["col"]} : uuid <<PK>>')
        lines.append('  --')
        shown = 0
        for c in m['cols']:
            if c['pk'] or c['field'] in SKIP_COLS:
                continue
            is_fk = c['field'] in fks
            if not is_fk and shown >= MAX_COLS:
                continue
            typ = SQL.get(c['type'], 'enum')
            tag = ' <<FK>>' if is_fk else (' <<UQ>>' if c['unique'] else '')
            star = '' if c['opt'] else '* '
            lines.append(f'  {star}{c["col"]} : {typ}{tag}')
            if not is_fk:
                shown += 1
        lines.append('}')
    lines.append('')
    seen = set()
    for mname in wanted:
        for fk, target in models[mname]['rels']:
            if target in wanted and (mname, target, fk) not in seen:
                seen.add((mname, target, fk))
                col = next((c for c in models[mname]['cols'] if c['field'] == fk), None)
                opt = col and col['opt']
                unique = col and col['unique']
                left = '|o' if opt else '||'
                right = 'o|' if unique else 'o{'
                lines.append(f'{target} {left}--{right} {mname}')
    lines.append('@enduml')
    open(os.path.join(HERE, 'so-do', name + '.puml'), 'w').write('\n'.join(lines) + '\n')


def main():
    models = parse()
    for name, (title, wanted) in GROUPS.items():
        missing = [w for w in wanted if w not in models]
        if missing:
            raise SystemExit(f'Không thấy bảng {missing}')
        emit(name, title, wanted, models)
        print('ok', name)
    print(f'{len(models)} bảng trong schema')


if __name__ == '__main__':
    main()
