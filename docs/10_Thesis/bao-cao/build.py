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
import unicodedata
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
        set_font(s, bold=False, italic=True)
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
    para(s, L, after=6, indent=Cm(0))
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


GAPS = {}  # caption prefix -> lines of white space left above the figure (seen in the last render)
USED = {}  # caption prefix -> lines actually moved in front of the figure by the last build
ROUNDS = {}  # caption prefix -> how many times its gap was topped up
PULL = {}  # caption prefix -> lines of following body text to place before the figure
def figure_fonts():
    """Caption prefix -> printed size (pt) of the body text inside a PlantUML figure at its
    width before any extra shrinking, so that fitting a page never makes it unreadable."""
    from PIL import Image
    out = {}
    for name in BODY:
        text = open(os.path.join(HERE, name), encoding='utf-8').read()
        for m in re.finditer(r'hinh/([^)]+)\.png\)\{width=([\d.]+)cm\}\n:::\n\n::: \{custom-style="hình"\}\n(Hình [\d.]+\.)', text):
            img, width, cap = m.group(1), float(m.group(2)), m.group(3)
            puml = os.path.join(HERE, 'so-do', img + '.puml')
            if not os.path.exists(puml):
                continue
            size = re.search(r'defaultFontSize (\d+)', open(puml, encoding='utf-8').read())
            size = int(size.group(1)) if size else 15  # _kieu.iuml
            px_w, px_h = Image.open(os.path.join(HERE, 'hinh', img + '.png')).size
            cm = width * min(1.0, 15 / width, 21 / (width * px_h / px_w))
            out[cap] = size * (cm / 2.54 * 72) * 220 / (72 * px_w)
    return out


FONTS = None
MIN_FONT = 8.0  # pt: smallest text a diagram may be shrunk to


FIT = {}  # caption prefix ("Hình 3.8.") -> extra scale so the figure fits the gap above it


def caption_after(p):
    """Prefix "Hình x.y." of the caption that follows an image paragraph."""
    nxt = p._p.getnext()
    while nxt is not None and not ''.join(nxt.itertext()).strip():
        nxt = nxt.getnext()
    m = re.match(r'(Hình [0-9A-Z]+\.\d+\.)', ''.join(nxt.itertext()).strip()) if nxt is not None else None
    return m.group(1) if m else None


def fit_gaps(pdf):
    """Figures pushed to the next page that would fit the white space left above them
    if shrunk a little (see the limits below): returns {caption prefix: scale}."""
    xml = subprocess.run(['pdftotext', '-bbox', pdf, '-'], capture_output=True, text=True).stdout
    pages = re.findall(r'<page width="[\d.]+" height="([\d.]+)">(.*?)</page>', xml, re.S)
    cm = 28.35
    found = {}
    for i in range(len(pages) - 1):
        h = float(pages[i][0])
        words = [(float(a), float(b), w) for a, b, w in re.findall(r'yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)">([^<]*)<', pages[i][1])]
        body = [b for a, b, w in words if a > 2.5 * cm]  # skip the page number in the header
        nxt = [(float(a), float(b), w) for a, b, w in re.findall(r'yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)">([^<]*)<', pages[i + 1][1])]
        nxt = [x for x in nxt if x[0] > 2.5 * cm]
        if not body or not nxt or nxt[0][2] != 'Hình':
            continue
        cap_top = nxt[0][0]
        num = nxt[1][2]
        # caption + source block: from the caption to the first line after "Nguồn: ..."
        src = [b for a, b, w in nxt if w.startswith('Nguồn')]
        if not src:
            continue
        cap_block = max(b for a, b, w in nxt if a <= src[0] + 2) - cap_top
        img_h = cap_top - 2.5 * cm - 6
        free = h - 2.5 * cm - max(body) - 18  # room left on the page, minus spacing
        k = (free - cap_block - 12) / img_h
        # Diagrams (chapters 1 and 3) may shrink by 25 %; screenshots only by 10 % to stay legible.
        global FONTS
        if FONTS is None:
            FONTS = figure_fonts()
        floor = 0.7 if num[0] in '13' else 0.9  # use-case diagrams (chapter 2) are already small
        font = FONTS.get(f'Hình {num}')
        if font:
            floor = max(floor, MIN_FONT / font)  # never shrink diagram text below MIN_FONT
        if floor <= k < 1:
            found[f'Hình {num}'] = k
        elif k < 1 and free > 4 * 22.5:
            # Too tall to shrink into the gap: let the text that follows the figure fill it instead.
            GAPS[f'Hình {num}'] = int(free / 22.5) - 1
    return found


TIGHT = {}  # start of a paragraph (normalised) -> character spacing in twips (negative = condensed)


def short_tails(pdf):
    """Paragraphs of two or more lines whose last line holds only one or two words:
    returns the normalised start of each, to be condensed by about 0.6 pt."""
    xml = subprocess.run(['pdftotext', '-bbox-layout', pdf, '-'], capture_output=True, text=True).stdout
    cm = 28.35
    found = []
    for page in re.findall(r'<page [^>]*>(.*?)</page>', xml, re.S):
        lines = [(float(a), float(b), float(c), re.findall(r'>([^<]*)</word>', w))
                 for a, b, c, w in re.findall(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">(.*?)</line>', page, re.S)]
        lines = [l for l in lines if l[1] > 2.5 * cm]  # skip the page number
        if not lines:
            continue
        right = max(l[2] for l in lines)
        para = []
        for x0, y, x1, words in lines:  # a line ending short of the right margin ends a paragraph
            para.append((x1 - x0, words))
            if x1 < right - 0.5 * cm:
                if len(para) >= 2 and para[0][0] > 13 * cm and (len(words) <= 2 or para[-1][0] < 0.12 * para[0][0]):
                    found.append(norm(' '.join(para[0][1]))[:40])
                para = []
    return found


def tighten(doc):
    if not TIGHT:
        return
    for p in doc.paragraphs:
        t = norm(p.text)
        if p._p in COVER or not t or t[0] in '/#' or t.isupper():
            continue  # cover, code, all-caps titles
        k = next((v for key, v in TIGHT.items() if t.startswith(key) or t.lstrip('•–- ').startswith(key.lstrip('•–- '))), None)
        if k is None:
            continue
        for r in p.runs:
            rpr = r._r.get_or_add_rPr()
            sp = rpr.find(qn('w:spacing'))
            if sp is None:
                sp = OxmlElement('w:spacing')
                rpr.append(sp)
            sp.set(qn('w:val'), str(k))


def text_of(el):
    """Plain text of a block (itertext also walks pandoc's field copies and repeats it)."""
    return ''.join(t.text or '' for t in el.iter(qn('w:t')))


def pull_text(doc):
    """Word has no floats: move the plain paragraphs that follow a figure in front of it,
    as many as fit the white space the figure left on the previous page."""
    for p in list(doc.paragraphs):
        if p._p in COVER or not p._p.findall('.//' + qn('w:drawing')):
            continue
        cap = caption_after(p)
        budget = PULL.get(cap)
        if not budget:
            continue
        start = budget
        ext = next(p._p.iter(qn('wp:extent')))
        cx, cy = int(ext.get('cx')), int(ext.get('cy'))
        # A figure that fills most of a page must start a page: text pulled in front of it may
        # not overshoot the gap, or its remainder would sit alone on the page before the figure.
        tall = cy * min(1.0, Cm(15) / cx, Cm(21) / cy) * FIT.get(cap, 1.0) > Cm(12)
        el = p._p.getnext()
        for _ in range(2):  # skip the caption and the source line
            while el is not None and el.tag != qn('w:p'):
                el = el.getnext()
            el = el.getnext() if el is not None else None
        def sid_of(e):
            st = e.find(qn('w:pPr') + '/' + qn('w:pStyle')) if e is not None and e.tag == qn('w:p') else None
            return unicodedata.normalize('NFC', st.get(qn('w:val'))) if st is not None else ''

        def step(e, marks):
            """Next block after e; the bookmark tags pandoc puts between blocks are collected to move along."""
            e = e.getnext()
            while e is not None and e.tag in (qn('w:bookmarkStart'), qn('w:bookmarkEnd')):
                marks.append(e)
                e = e.getnext()
            return e

        pre = []
        if el is not None and el.tag in (qn('w:bookmarkStart'), qn('w:bookmarkEnd')):
            pre.append(el)
            el = step(el, pre)
        while el is not None and el.tag == qn('w:p'):
            run, cost = list(pre), 0.0  # a heading never moves: the figure must stay in its own section
            cur = el
            if sid_of(el) == 'bảng' and budget >= 4:
                # A table (caption, grid, source line) breaks across pages, so it fills any gap.
                block = run + [el]
                tbl = step(el, block)
                if tbl is None or tbl.tag != qn('w:tbl'):
                    break
                if tall and 5 + 1.2 * len(tbl.findall(qn('w:tr'))) > budget + 1:
                    break
                block.append(tbl)
                tail = []
                src = step(tbl, tail)
                if sid_of(src) == 'nguồn':
                    block += tail + [src]
                pre = []
                el = step(block[-1], pre)
                for r in block:
                    p._p.addprevious(r)
                budget -= 5 + 1.2 * len(tbl.findall(qn('w:tr')))
                if budget <= 0:
                    break
                continue
            heads = 0
            while cur is not None and cur.tag == qn('w:p'):
                sid = sid_of(cur)
                if 'Kết luận chương' in text_of(cur) or cur.findall('.//' + qn('w:drawing')) or sid not in ('FirstParagraph', 'BodyText', 'Compact'):
                    cur = None
                    break
                run.append(cur)
                if sid in ('Heading3', 'Heading2'):
                    heads += 1
                    cost += 2.2
                    cur = step(cur, run)
                    continue
                cost += len(text_of(cur)) // 85 + (1.1 if sid == 'Compact' else 1.3)
                break
            if cur is None or budget < 3 or (heads and budget < 4.5) or (tall and cost > budget + 1):
                break  # paragraphs break across pages: before a short figure the last one may overshoot the gap
            budget -= cost
            pre = []
            el = step(cur, pre)
            for r in run:
                p._p.addprevious(r)
        USED[cap] = start - budget


def finish(doc, pages=None):
    body = doc.element.body
    pull_text(doc)
    # Placeholders written in the Markdown as [[TOC]], [[HINH]], [[BANG]], [[NGAT]].
    codes = {'[[TOC]]': ' TOC \\o "1-3" \\h \\z ', '[[HINH]]': ' TOC \\h \\z \\t "hình,1" ',
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
                k *= FIT.get(caption_after(p), 1.0)
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
    # Arabic numerals only. MỞ ĐẦU is page 1; the cover and the front matter
    # show no number (Arabic numbers there would repeat the body's 1, 2…);
    # the reference list and the appendices continue the body's numbering.
    secs[0].header.is_linked_to_previous = False
    secs[1].header.is_linked_to_previous = False
    page_header(secs[2], fmt='decimal', start=1)
    page_header(secs[3], fmt='decimal')
    lists = finish(doc, pages)
    tighten(doc)
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
    """The number printed on the page of every entry, searched in document order."""
    pages_lines = [[norm(l) for l in t.splitlines() if norm(l)] for t in texts]
    # The number printed in the page header (first line), not the PDF page index.
    printed = [int(l[0]) if l and l[0].isdigit() else 0 for l in pages_lines]

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
            out.append(printed[k])
        found[key] = out
    return found


def main():
    out, lists = build()
    for _ in range(9):  # shrink figures that leave a large gap above them, or fill the gap with text
        render(out)
        new = fit_gaps(os.path.join(OUT, os.path.basename(out)[:-5] + '.pdf'))
        new = {c: k for c, k in new.items() if c not in FIT}
        pull = {c: USED.get(c, 0) + n for c, n in GAPS.items() if c not in new and ROUNDS.get(c, 0) < 4}
        for c in pull:
            ROUNDS[c] = ROUNDS.get(c, 0) + 1
        GAPS.clear()
        if not new and not pull:
            break
        FIT.update(new)
        PULL.update(pull)
        if new:
            print('Thu nhỏ để vừa trang: ' + ', '.join(f'{c} ×{k:.2f}' for c, k in new.items()))
        if pull:
            print('Đưa đoạn văn lên trước hình: ' + ', '.join(f'{c} ({n} dòng)' for c, n in pull.items()))
        out, lists = build()
    for k in (-10, -12):  # pull up a last line of one or two words (condense 0.5, then 0.6 pt)
        render(out)
        tails = short_tails(os.path.join(OUT, os.path.basename(out)[:-5] + '.pdf'))
        tails = [t for t in tails if TIGHT.get(t, 0) > k]
        if not tails:
            break
        TIGHT.update({t: k for t in tails})
        print(f'Co chữ {k / 20:.1f} pt cho {len(tails)} đoạn có dòng cuối 1–2 từ')
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
