"""Build the thesis report (.docx) from the Markdown chapters in this folder.

    python3.13 docs/10_Thesis/bao-cao/build.py      # needs pandoc and python-docx

Formatting follows the Phenikaa ĐAKLTN rules: Times New Roman 13, line spacing
1.5, margins top/bottom/right 2.5 cm and left 3.5 cm, A4, page number centred
at the top, Arabic numerals throughout (the cover pages count but show no
number). Figure, table and source lines use the paragraph styles "hình", "bảng"
and "nguồn".

The table of contents and the lists of figures and tables are Word TOC fields
whose results are filled in already: the script builds once, renders a PDF with
LibreOffice, finds the page of every heading and caption, and builds again with
those page numbers (twice more if the numbers moved). Word can still refresh
them with F9.
"""
import copy
import os
import re
import subprocess
import sys

import shutil
import tempfile

import docx
from docx.oxml import parse_xml
from docx.enum.section import WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
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
    # Theme fonts (Heading styles of the pandoc reference) win over w:ascii.
    for a in ('w:asciiTheme', 'w:hAnsiTheme', 'w:cstheme', 'w:eastAsiaTheme'):
        if fonts.get(qn(a)) is not None:
            del fonts.attrib[qn(a)]


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
    s = style(d, 'Bìa trái')  # signature at the right of the page
    set_font(s, 13)
    para(s, C, after=3, line=1.3, indent=Cm(0))
    s.paragraph_format.left_indent = Cm(8)
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
    s = style(d, 'Source Code')
    para(s, L, before=0, after=0, line=1.0, indent=Cm(0))
    s.font.size = Pt(10)
    # Front pages laid out like the school's forms (QT.ĐT.19.M07/M08).
    s = style(d, 'Thông tin')
    set_font(s)
    para(s, L, before=0, after=0, line=1.5, indent=Cm(0))
    s = style(d, 'Mục nhận xét')
    set_font(s, bold=True)
    para(s, L, before=12, after=0, line=1.5, indent=Cm(0), keep=True)
    s = style(d, 'Dòng chấm')  # a line of dots: one tab to a dotted right tab stop
    set_font(s)
    para(s, L, before=0, after=0, line=1.5, indent=Cm(0))
    s.paragraph_format.tab_stops.add_tab_stop(Cm(15), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
    s = style(d, 'Ngày ký')
    set_font(s, italic=True)
    para(s, WD_ALIGN_PARAGRAPH.RIGHT, before=12, after=6, indent=Cm(0))
    # A caption stays on the page of its source line.
    style(d, 'hình').paragraph_format.keep_with_next = True
    # Entries of the table of contents and of the lists of figures and tables.
    for name, left, bold in (('Mục lục 1', 0, True), ('Mục lục 2', 0.6, False), ('Mục lục 3', 1.2, False),
                             ('Danh mục', 0, False)):
        s = style(d, name)
        set_font(s, 13, bold=bold, italic=False)
        para(s, L, before=0, after=3, line=1.3, indent=Cm(0))
        s.paragraph_format.left_indent = Cm(left)
        s.paragraph_format.right_indent = Cm(0.8)
        s.paragraph_format.tab_stops.add_tab_stop(Cm(15), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
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


def entries(doc):
    """What the table of contents and the two lists show, in document order."""
    toc, figs, tabs, after_toc = [], [], [], False
    for p in doc.paragraphs:
        name, text = p.style.name, ' '.join(p.text.split())
        if text == '[[TOC]]':
            after_toc = True
        elif name == 'Tiêu đề phụ' and after_toc and text != 'MỤC LỤC':
            toc.append((1, text))
        elif name in ('Heading 1', 'Heading 2', 'Heading 3') and text:
            toc.append((int(name[-1]), text))
        elif name == 'hình' and text:
            figs.append((0, text))
        elif name == 'bảng' and text:
            tabs.append((0, text))
    return {'[[TOC]]': toc, '[[HINH]]': figs, '[[BANG]]': tabs}


def fill_list(doc, p, code, items, pages):
    """Replace the marker paragraph by a TOC field whose result is the entries."""
    def run(tag, **attrs):
        r = OxmlElement('w:r')
        el = OxmlElement(tag)
        for k, v in attrs.items():
            el.set(qn(k), v)
        if tag == 'w:instrText':
            el.set(qn('xml:space'), 'preserve')
            el.text = code
        r.append(el)
        return r
    anchor = p._p
    made = []
    for i, (level, text) in enumerate(items):
        q = OxmlElement('w:p')
        anchor.addprevious(q)
        para_ = docx.text.paragraph.Paragraph(q, p._parent)
        para_.style = doc.styles['Danh mục' if level == 0 else f'Mục lục {level}']
        if i == 0:
            q.append(run('w:fldChar', **{'w:fldCharType': 'begin'}))
            q.append(run('w:instrText'))
            q.append(run('w:fldChar', **{'w:fldCharType': 'separate'}))
        para_.add_run(text)
        para_.add_run('\t' + str(pages[i] if pages else 0))
        made.append(q)
    if made:
        made[-1].append(run('w:fldChar', **{'w:fldCharType': 'end'}))
    anchor.getparent().remove(anchor)


COVER = set()  # elements of the cover pages: left exactly as bia.xml lays them out


def cover(doc):
    """[[BIA]] → the cover and the inner cover in the school's layout (form
    QT.ĐT.19.M07): the cover is a framed table with the student's name and the
    major on a vertical spine strip, the inner cover sits in a thick frame.
    The layout lives in bia.xml (Word XML); LOGO stands for the logo image."""
    p = next(p for p in doc.paragraphs if p.text.strip() == '[[BIA]]')
    rid, _ = doc.part.get_or_add_image(os.path.join(HERE, 'hinh', 'logo-phenikaa.jpeg'))
    xml = open(os.path.join(HERE, 'bia.xml')).read().replace('"LOGO"', f'"{rid}"')
    parts = list(parse_xml(xml))  # python-docx element classes, so doc.tables works
    for n, dp in enumerate(e for part in parts for e in part.iter(qn('wp:docPr'))):
        dp.set('id', str(900001 + n))
    for part in parts:
        p._p.addprevious(part)
        COVER.add(part)
        # The form was laid out on single-spaced, left-aligned paragraphs; the
        # report's Normal style (1.5 lines, justified, 6 pt after) must not leak in.
        for q in part.iter(qn('w:p')):
            ppr = q.find(qn('w:pPr'))
            if ppr is None:
                ppr = OxmlElement('w:pPr')
                q.insert(0, ppr)
            sp = ppr.find(qn('w:spacing'))
            if sp is None:
                sp = OxmlElement('w:spacing')
                ppr.append(sp)
            if sp.get(qn('w:line')) is None:
                sp.set(qn('w:line'), '240')
                sp.set(qn('w:lineRule'), 'auto')
            for k in ('w:before', 'w:after'):
                if sp.get(qn(k)) is None:
                    sp.set(qn(k), '0')
            if ppr.find(qn('w:ind')) is None:
                ind = OxmlElement('w:ind')
                ind.set(qn('w:firstLine'), '0')
                ppr.append(ind)
            if ppr.find(qn('w:jc')) is None:
                jc = OxmlElement('w:jc')
                jc.set(qn('w:val'), 'left')
                ppr.append(jc)
    # The inner cover starts on a new page.
    frame = parts[1]
    ppr = frame.find(qn('w:pPr'))
    ppr.insert(0, OxmlElement('w:pageBreakBefore'))
    p._p.getparent().remove(p._p)


def finish(doc, pages=None):
    body = doc.element.body
    # Placeholders written in the Markdown as [[TOC]], [[HINH]], [[BANG]], [[NGAT]].
    codes = {'[[TOC]]': ' TOC \\o "1-3" \\h \\z \\t "Tiêu đề phụ,1" ', '[[HINH]]': ' TOC \\h \\z \\t "hình,1" ',
             '[[BANG]]': ' TOC \\h \\z \\t "bảng,1" '}
    lists = entries(doc)
    cover(doc)
    for p in list(doc.paragraphs):
        t = (p.text or '').strip()
        if t in codes:
            fill_list(doc, p, codes[t], lists[t], (pages or {}).get(t))
        elif t == '[[CHAM]]':
            p.runs[0].text = '\t'
            for r in p.runs[1:]:
                r._r.getparent().remove(r._r)
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
        if p._p not in COVER and p._p.findall('.//' + qn('w:drawing')):
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
    # Signature block of LỜI CAM ĐOAN: a borderless two-column table.
    for tbl in list(doc.tables):
        if tbl.rows[0].cells[0].text.strip() == 'GIẢNG VIÊN HƯỚNG DẪN':
            tblPr = tbl._tbl.tblPr
            for old in tblPr.findall(qn('w:tblBorders')) + tblPr.findall(qn('w:tblStyle')):
                tblPr.remove(old)
            borders = OxmlElement('w:tblBorders')
            for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
                b = OxmlElement(f'w:{side}')
                b.set(qn('w:val'), 'nil')
                borders.append(b)
            tblPr.append(borders)
            w = tblPr.find(qn('w:tblW'))
            if w is None:
                w = OxmlElement('w:tblW')
                tblPr.append(w)
            w.set(qn('w:type'), 'pct')
            w.set(qn('w:w'), '5000')
            for gc in tbl._tbl.tblGrid.findall(qn('w:gridCol')):
                gc.set(qn('w:w'), '4250')
            for row in tbl.rows:
                for cell in row.cells:
                    tcPr = cell._tc.get_or_add_tcPr()
                    for old in tcPr.findall(qn('w:tcW')):
                        tcPr.remove(old)
                    tw = OxmlElement('w:tcW')
                    tw.set(qn('w:w'), '4250')
                    tw.set(qn('w:type'), 'dxa')
                    tcPr.insert(0, tw)
            for i, row in enumerate(tbl.rows):
                for cell in row.cells:
                    for cp in cell.paragraphs:
                        cp.style = doc.styles['Bìa thường']
                        cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
                        for r in cp.runs:
                            r.bold = i == 0 or cp.text == 'Trần Tuấn Anh'
                            r.italic = i == 1
            tbl._signature = True
    # Tables: full width, borders, 12 pt cells, header row repeated.
    for tbl in doc.tables:
        if tbl._tbl in COVER or tbl.rows[0].cells[0].text.strip() == 'GIẢNG VIÊN HƯỚNG DẪN':
            continue
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
        # Column widths by content: longer text gets a wider column.
        ncol = len(tbl.columns)
        lens = [0] * ncol
        for row in tbl.rows:
            for j, cell in enumerate(row.cells[:ncol]):
                lens[j] = max(lens[j], min(len(cell.text), 60))
        words = [0] * ncol
        for row in tbl.rows:
            for j, cell in enumerate(row.cells[:ncol]):
                words[j] = max([words[j]] + [len(w) for w in cell.text.split()])
        floor = [min(130 * w + 250, 2600) for w in words]  # longest word fits on one line
        weights = [max(l, 6) ** 0.8 for l in lens]
        spare = max(8500 - sum(floor), 0)
        total = sum(weights)
        widths = [int(f + spare * x / total) for f, x in zip(floor, weights)]
        grid = tbl._tbl.tblGrid
        for j, gc in enumerate(grid.findall(qn('w:gridCol'))):
            gc.set(qn('w:w'), str(widths[j]))
        for row in tbl.rows:
            for j, cell in enumerate(row.cells[:ncol]):
                tcPr = cell._tc.get_or_add_tcPr()
                for old in tcPr.findall(qn('w:tcW')):
                    tcPr.remove(old)
                tw = OxmlElement('w:tcW')
                tw.set(qn('w:w'), str(widths[j]))
                tw.set(qn('w:type'), 'dxa')
                tcPr.insert(0, tw)
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
            # A row is never split across two pages.
            trPr = row._tr.get_or_add_trPr()
            trPr.append(OxmlElement('w:cantSplit'))
    return lists


def build(pages=None):
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
            # An empty 1-pt line: after a full-page table it must not spill onto a page of its own.
            p.paragraph_format.space_before = p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = Pt(1)
            sp = copy.deepcopy(final)
            for ref_el in sp.findall(qn('w:headerReference')) + sp.findall(qn('w:footerReference')):
                sp.remove(ref_el)
            p._p.get_or_add_pPr().append(sp)
    secs = doc.sections
    assert len(secs) == 4, f'expected 4 sections, got {len(secs)}'
    for sec in secs:
        geometry(sec)
        sec.start_type = WD_SECTION.NEW_PAGE
    # Arabic numerals all the way: the cover pages count but show no number.
    secs[0].header.is_linked_to_previous = False
    page_header(secs[1], fmt='decimal')
    page_header(secs[2], fmt='decimal')
    page_header(secs[3], fmt='decimal')
    lists = finish(doc, pages)
    out = os.path.join(OUT, 'BaoCao_DATN_TranTuanAnh.docx')
    doc.save(out)
    os.remove(tmp)
    return out, lists


def render(path):
    """PDF of the .docx through LibreOffice; returns the text of each page."""
    tmp = tempfile.mkdtemp()
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', tmp, path],
                   check=True, capture_output=True, timeout=600)
    pdf = os.path.join(tmp, os.path.basename(path)[:-5] + '.pdf')
    shutil.copy(pdf, os.path.join(OUT, os.path.basename(pdf)))
    n = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout).group(1))
    texts = [subprocess.run(['pdftotext', '-layout', '-f', str(i), '-l', str(i), pdf, '-'],
                            capture_output=True, text=True).stdout for i in range(1, n + 1)]
    shutil.rmtree(tmp)
    return texts


def norm(t):
    return ' '.join(t.split())


def locate(texts, lists):
    """Page (1-based, the number printed on it) of every entry, searched in order."""
    pages_lines = [[norm(l) for l in t.splitlines() if norm(l)] for t in texts]

    def on(lines, want):
        for j, l in enumerate(lines):
            if '....' in l or '…' in l:
                continue  # a line of the table of contents or of a list
            joined = l if j + 1 == len(lines) else l + ' ' + lines[j + 1]
            if l.startswith(want) or (len(l) >= 12 and want.startswith(l) and joined.startswith(want)):
                return True
        return False

    found = {}
    for key, items in lists.items():
        k, out = 0, []
        for _, text in items:
            want = norm(text)[:40]
            while k < len(pages_lines) and not on(pages_lines[k], want):
                k += 1
            if k == len(pages_lines):
                raise SystemExit(f'Không thấy trang của: {text}')
            out.append(k + 1)
        found[key] = out
    return found


def main():
    out, lists = build()
    pages = None
    for _ in range(3):
        new = locate(render(out), lists)
        if new == pages:
            break
        pages = new
        out, lists = build(pages)
    print(out)
    print('Trang: ' + ', '.join(f'{t} → {n}' for t, n in zip(
        [x[1] for x in lists['[[TOC]]'] if x[0] == 1], [n for (lv, _), n in zip(lists['[[TOC]]'], pages['[[TOC]]']) if lv == 1])))


if __name__ == '__main__':
    sys.exit(main())
