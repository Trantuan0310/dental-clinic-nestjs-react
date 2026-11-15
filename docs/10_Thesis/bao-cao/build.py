"""Build the thesis report (.docx) from the Markdown chapters in this folder.

    python3.13 docs/10_Thesis/bao-cao/build.py      # needs pandoc and python-docx

Formatting follows the Phenikaa ĐAKLTN rules: Times New Roman 13, line spacing
1.5, margins top/bottom/right 2.5 cm and left 3.5 cm, A4, page number centred
at the top (lower-case Roman for the front matter and the back matter, Arabic
from MỞ ĐẦU to KẾT LUẬN). Figure, table and source lines use the paragraph
styles "hình", "bảng" and "nguồn"; the lists of figures and tables are Word
TOC fields built from those styles (Word asks to update fields on open).
"""
import copy
import os
import re
import subprocess
import sys

import docx
from docx.enum.section import WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
FONT = 'Times New Roman'

FRONT = ['00-bia.md', '01-dau.md']
BODY = ['10-mo-dau.md', '11-chuong-1.md', '12-chuong-2.md', '13-chuong-3.md', '14-chuong-4.md', '15-chuong-5.md',
        '16-ket-luan.md']
BACK = ['20-tai-lieu.md', '21-phu-luc.md']  # 20 is generated from tai_lieu.py


def set_font(style, size=13, bold=None, italic=None, color=True):
    f = style.font
    f.name = FONT
    f.size = Pt(size)
    if bold is not None:
        f.bold = bold
    if italic is not None:
        f.italic = italic
    if color:
        f.color.rgb = RGBColor(0, 0, 0)
    rpr = style.element.get_or_add_rPr()
    fonts = rpr.find(qn('w:rFonts'))
    if fonts is None:
        fonts = OxmlElement('w:rFonts')
        rpr.append(fonts)
    for a in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
        fonts.set(qn(a), FONT)


def para(style, align=None, before=0, after=6, line=1.5, indent=None, keep=False):
    pf = style.paragraph_format
    if align is not None:
        pf.alignment = align
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.line_spacing = line
    if indent is not None:
        pf.first_line_indent = indent
    if keep:
        pf.keep_with_next = True


def style(doc, name, base='Normal'):
    for st in doc.styles:
        if st.name == name:
            return st
    try:
        return doc.styles[name]
    except KeyError:
        s = doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
        s.base_style = doc.styles[base]
        return s


def make_reference(path):
    raw = subprocess.run(['pandoc', '--print-default-data-file', 'reference.docx'],
                         capture_output=True, check=True).stdout
    open(path, 'wb').write(raw)
    d = docx.Document(path)
    J, C, L = WD_ALIGN_PARAGRAPH.JUSTIFY, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT
    for name in ('Normal', 'Body Text', 'First Paragraph', 'Compact', 'Block Text'):
        s = style(d, name)
        set_font(s)
        para(s, J, after=6, indent=Cm(1) if name in ('Body Text', 'First Paragraph') else None)
    para(style(d, 'Compact'), J, after=2)
    for lvl, size in ((1, 14), (2, 13), (3, 13), (4, 13)):
        s = style(d, f'Heading {lvl}')
        set_font(s, size, bold=True, italic=(lvl == 4))
        para(s, C if lvl == 1 else L, before=0 if lvl == 1 else 6, after=12 if lvl == 1 else 6, keep=True)
        s.paragraph_format.page_break_before = lvl == 1
        s.paragraph_format.first_line_indent = Cm(0)
    for name in ('hình', 'bảng'):
        s = style(d, name)
        set_font(s, bold=False, italic=False)
        para(s, C, before=3, after=6, indent=Cm(0))
    para(style(d, 'bảng'), C, before=6, after=3, indent=Cm(0), keep=True)
    s = style(d, 'nguồn')
    set_font(s, 12, italic=True)
    para(s, C, after=6, indent=Cm(0))
    for name, size, bold in (('Bìa', 14, True), ('Bìa thường', 13, False), ('Bìa lớn', 22, True), ('Bìa đề tài', 16, True)):
        s = style(d, name)
        set_font(s, size, bold=bold)
        para(s, C, before=0, after=6, line=1.3, indent=Cm(0))
    s = style(d, 'Bìa trái')
    set_font(s, 13)
    para(s, L, after=3, line=1.3, indent=Cm(0))
    s.paragraph_format.left_indent = Cm(3)
    s = style(d, 'Tiêu đề phụ')
    set_font(s, 14, bold=True)
    para(s, C, before=0, after=12, indent=Cm(0), keep=True)
    s = style(d, 'Tài liệu')
    set_font(s)
    para(s, J, after=6, indent=Cm(0))
    s.paragraph_format.left_indent = Cm(1)
    s.paragraph_format.first_line_indent = Cm(-1)
    s = style(d, 'Ảnh')
    set_font(s)
    para(s, C, before=6, after=0, line=1.0, indent=Cm(0), keep=True)
    for name in ('Table', 'Table Paragraph'):
        try:
            set_font(d.styles[name], 12)
        except KeyError:
            pass
    s = style(d, 'Ô bảng')
    set_font(s, 12)
    para(s, L, after=0, line=1.15, indent=Cm(0))
    for name in ('Source Code', 'Verbatim Char'):
        try:
            d.styles[name].font.size = Pt(10)
        except KeyError:
            pass
    d.save(path)


def field(paragraph, code):
    """A Word field (TOC, PAGE…) shown as 'Nhấn F9…' until Word updates it."""
    def r(tag, **attrs):
        run = OxmlElement('w:r')
        el = OxmlElement(tag)
        for k, v in attrs.items():
            el.set(qn(k), v)
        if tag == 'w:instrText':
            el.set(qn('xml:space'), 'preserve')
            el.text = code
        run.append(el)
        return run
    p = paragraph._p
    p.append(r('w:fldChar', **{'w:fldCharType': 'begin', 'w:dirty': 'true'}))
    p.append(r('w:instrText'))
    p.append(r('w:fldChar', **{'w:fldCharType': 'separate'}))
    t = OxmlElement('w:r')
    tx = OxmlElement('w:t')
    tx.text = 'Nhấn F9 (hoặc chuột phải → Update Field) để cập nhật.' if 'TOC' in code else '1'
    t.append(tx)
    p.append(t)
    p.append(r('w:fldChar', **{'w:fldCharType': 'end'}))


def page_header(section, fmt=None, start=None):
    sp = section._sectPr
    for old in sp.findall(qn('w:pgNumType')):
        sp.remove(old)
    pg = OxmlElement('w:pgNumType')
    if fmt:
        pg.set(qn('w:fmt'), fmt)
    if start is not None:
        pg.set(qn('w:start'), str(start))
    sp.append(pg)
    section.header.is_linked_to_previous = False
    h = section.header.paragraphs[0]
    for r in list(h.runs):
        r._r.getparent().remove(r._r)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    field(h, ' PAGE ')
    for r in h.runs:
        r.font.name = FONT
        r.font.size = Pt(13)


def geometry(section):
    section.page_width, section.page_height = Cm(21), Cm(29.7)
    section.top_margin = section.bottom_margin = section.right_margin = Cm(2.5)
    section.left_margin = Cm(3.5)
    section.header_distance = Cm(1.25)


CITE = re.compile(r'\[(@[A-Za-z0-9_]+(?:\s*;\s*@[A-Za-z0-9_]+)*)\]')


def cite(files):
    """[@a; @b] → [1, 2] in order of first appearance; writes the reference list."""
    sys.path.insert(0, HERE)
    from tai_lieu import REFS
    order, out = [], []
    src_dir = os.path.join(OUT, '_src')
    os.makedirs(src_dir, exist_ok=True)

    def number(m):
        nums = []
        for key in re.findall(r'@([A-Za-z0-9_]+)', m.group(1)):
            if key not in REFS:
                raise SystemExit(f'Unknown reference [@{key}]')
            if key not in order:
                order.append(key)
            nums.append(order.index(key) + 1)
        nums = sorted(set(nums))
        # 3, 4, 5 → 3–5
        parts, i = [], 0
        while i < len(nums):
            j = i
            while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
                j += 1
            parts.append(f'{nums[i]}–{nums[j]}' if j - i >= 2 else ', '.join(map(str, nums[i:j + 1])))
            i = j + 1
        return '[' + ', '.join(parts) + ']'

    for f in files:
        path = os.path.join(HERE, f)
        if f == '20-tai-lieu.md':
            continue
        if not os.path.exists(path):
            continue
        dst = os.path.join(src_dir, f)
        open(dst, 'w').write(CITE.sub(number, open(path).read()))
        out.append(dst)
    lst = os.path.join(src_dir, '20-tai-lieu.md')
    lines = ['# TÀI LIỆU THAM KHẢO', '']
    for i, key in enumerate(order, 1):
        lines += ['::: {custom-style="Tài liệu"}', f'[{i}]\u00a0{REFS[key]}', ':::', '']
    open(lst, 'w').write('\n'.join(lines))
    # The list goes first in the back matter.
    back_at = next((k for k, x in enumerate(out) if os.path.basename(x).startswith('2')), len(out))
    out.insert(back_at, lst)
    print(f'{len(order)} tài liệu được trích dẫn')
    return out


def pandoc(files, out, ref):
    srcs = cite(files)
    subprocess.run(['pandoc', '--from=markdown+pipe_tables+grid_tables+fenced_divs+raw_attribute',
                    '--reference-doc', ref, '--resource-path', HERE, '-o', out, *srcs], check=True)


def finish(doc):
    body = doc.element.body
    # Placeholders written in the Markdown as [[TOC]], [[HINH]], [[BANG]], [[NGAT]].
    codes = {'[[TOC]]': ' TOC \\o "1-3" \\h \\z \\u ', '[[HINH]]': ' TOC \\h \\z \\t "hình,1" ',
             '[[BANG]]': ' TOC \\h \\z \\t "bảng,1" '}
    for p in list(doc.paragraphs):
        t = p.text.strip()
        if t in codes:
            for r in list(p.runs):
                r._r.getparent().remove(r._r)
            p.style = doc.styles['Normal']
            field(p, codes[t])
        elif t == '[[NGAT]]':
            # Page break as "page break before" on the next paragraph: a
            # break paragraph at the foot of a full page would leave a blank page.
            nxt = p._p.getnext()
            while nxt is not None and nxt.tag != qn('w:p') and nxt.tag != qn('w:tbl'):
                nxt = nxt.getnext()
            if nxt is not None and nxt.tag == qn('w:p'):
                ppr = nxt.find(qn('w:pPr'))
                if ppr is None:
                    ppr = OxmlElement('w:pPr')
                    nxt.insert(0, ppr)
                ppr.insert(1 if ppr.find(qn('w:pStyle')) is not None else 0, OxmlElement('w:pageBreakBefore'))
            p._p.getparent().remove(p._p)
    # Images: centred, at most the text width.
    for p in doc.paragraphs:
        if p._p.findall('.//' + qn('w:drawing')):
            p.style = doc.styles['Ảnh']
            for ext in p._p.iter(qn('wp:extent')):
                cx, cy = int(ext.get('cx')), int(ext.get('cy'))
                # Fit inside the text block: 15 cm wide, 21 cm tall (room for the caption).
                k = min(1.0, Cm(15) / cx, Cm(21) / cy)
                if k < 1.0:
                    ncx, ncy = str(int(cx * k)), str(int(cy * k))
                    ext.set('cx', ncx)
                    ext.set('cy', ncy)
                    for a in p._p.iter(qn('a:ext')):
                        a.set('cx', ncx)
                        a.set('cy', ncy)
    # Tables: full width, borders, 12 pt cells, header row repeated.
    for tbl in doc.tables:
        tbl.style = doc.styles['Table Grid'] if 'Table Grid' in [s.name for s in doc.styles] else tbl.style
        tblPr = tbl._tbl.tblPr
        borders = OxmlElement('w:tblBorders')
        for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
            b = OxmlElement(f'w:{side}')
            b.set(qn('w:val'), 'single')
            b.set(qn('w:sz'), '4')
            b.set(qn('w:color'), '000000')
            borders.append(b)
        for old in tblPr.findall(qn('w:tblBorders')):
            tblPr.remove(old)
        tblPr.append(borders)
        w = tblPr.find(qn('w:tblW'))
        if w is None:
            w = OxmlElement('w:tblW')
            tblPr.append(w)
        w.set(qn('w:type'), 'pct')
        w.set(qn('w:w'), '5000')
        for i, row in enumerate(tbl.rows):
            if i == 0:
                trPr = row._tr.get_or_add_trPr()
                h = OxmlElement('w:tblHeader')
                trPr.append(h)
            for cell in row.cells:
                for cp in cell.paragraphs:
                    cp.style = doc.styles['Ô bảng']
                    if i == 0:
                        for r in cp.runs:
                            r.bold = True
    settings = doc.settings.element
    upd = OxmlElement('w:updateFields')
    upd.set(qn('w:val'), 'true')
    settings.append(upd)


def main():
    os.makedirs(OUT, exist_ok=True)
    ref = os.path.join(OUT, 'reference.docx')
    make_reference(ref)
    tmp = os.path.join(OUT, '_pandoc.docx')
    pandoc(FRONT + BODY + BACK, tmp, ref)
    doc = docx.Document(tmp)
    body = doc.element.body
    final = body.find(qn('w:sectPr'))
    # [[HET_BIA]], [[HET_DAU]], [[HET_THAN]] end the cover, the front matter
    # and the body: the paragraph carries the section break (Word's model).
    for p in doc.paragraphs:
        if p.text.strip() in ('[[HET_BIA]]', '[[HET_DAU]]', '[[HET_THAN]]'):
            for r in list(p.runs):
                r._r.getparent().remove(r._r)
            sp = copy.deepcopy(final)
            for ref_el in sp.findall(qn('w:headerReference')) + sp.findall(qn('w:footerReference')):
                sp.remove(ref_el)
            p._p.get_or_add_pPr().append(sp)
    secs = doc.sections
    assert len(secs) == 4, f'expected 4 sections, got {len(secs)}'
    for sec in secs:
        geometry(sec)
        sec.start_type = WD_SECTION.NEW_PAGE
    # Cover: no number. Front matter i, ii… (cover counts as i). Body 1, 2…
    # from MỞ ĐẦU to KẾT LUẬN. Back matter continues in Roman numerals.
    secs[0].header.is_linked_to_previous = False
    page_header(secs[1], fmt='lowerRoman', start=2)
    page_header(secs[2], fmt='decimal', start=1)
    page_header(secs[3], fmt='lowerRoman', start=None)
    finish(doc)
    out = os.path.join(OUT, 'BaoCao_DATN_TranTuanAnh.docx')
    doc.save(out)
    os.remove(tmp)
    print(out)


if __name__ == '__main__':
    sys.exit(main())
