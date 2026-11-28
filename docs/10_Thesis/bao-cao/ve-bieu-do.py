"""Vẽ biểu đồ thống kê kiểm thử cho Chương 5 (Hình 5.1, Hình 5.2).

Số liệu lấy từ lần chạy thật:
- kiểm thử đơn vị: `npx jest --json` trong backend (28/11/2026), nhóm theo module;
- kiểm thử API: backend/test-results/.../jest-results.json (28/11/2026);
- E2E: `npx playwright test --list`, kết quả 122/122 đạt ở CI nhánh chính.
Độ bao phủ: Bảng 5.7 (jest --coverage, 17/11/2026).

Chạy: python3.13 docs/10_Thesis/bao-cao/ve-bieu-do.py
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

OUT = Path(__file__).parent / "hinh"
INK, INK2, GRID, SURF = "#0b0b0b", "#52514e", "#e4e3df", "#ffffff"
C_UNIT, C_API, C_E2E = "#2a78d6", "#eb6834", "#1baf7a"

plt.rcParams.update({
    "font.family": "Liberation Serif",
    "font.size": 11,
    "axes.edgecolor": INK2,
    "axes.labelcolor": INK,
    "xtick.color": INK2,
    "ytick.color": INK,
    "savefig.dpi": 300,
})

# (nhóm, đơn vị, API, E2E)
NHOM = [
    ("Bệnh nhân (BN)", 89, 10, 11),
    ("Lịch hẹn, tiếp nhận (LH)", 625, 21, 18),
    ("Khám, điều trị (KB)", 242, 17, 7),
    ("Hóa đơn, thanh toán (TT)", 118, 11, 7),
    ("Nhân sự, lương (NS)", 298, 23, 9),
    ("Kho vật tư (KH)", 27, 4, 3),
    ("Báo cáo (BC)", 58, 1, 9),
    ("Trợ lý AI (AI)", 80, 0, 7),
    ("Quản trị, phân quyền (QT)", 192, 23, 19),
    ("Hạ tầng, giao diện chung", 79, 3, 32),
]


def so(v: float, le: int = 0) -> str:
    s = f"{v:,.{le}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def don_truc(ax):
    for k in ("top", "right", "left"):
        ax.spines[k].set_visible(False)
    ax.tick_params(axis="y", length=0)
    ax.xaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def hinh_5_1():
    ten = [n[0] for n in NHOM][::-1]
    tang = [("Đơn vị", 1, C_UNIT), ("API trên PostgreSQL", 2, C_API), ("Đầu cuối (E2E)", 3, C_E2E)]
    fig, axes = plt.subplots(1, 3, figsize=(6.3, 3.9), sharey=True,
                             gridspec_kw={"width_ratios": [1.5, 1, 1], "wspace": 0.12})
    for ax, (nhan, i, mau) in zip(axes, tang):
        v = [n[i] for n in NHOM][::-1]
        ax.barh(ten, v, height=0.68, color=mau, edgecolor=SURF, linewidth=1)
        don_truc(ax)
        tong = sum(v)
        ax.set_title(f"{nhan}\n{so(tong)} ca, đạt 100%", fontsize=10.5, color=INK, pad=6)
        top = max(v)
        ax.set_xlim(0, top * 1.28)
        for y, x in enumerate(v):
            ax.text(x + top * 0.03, y, so(x), va="center", fontsize=9.5, color=INK2)
        ax.tick_params(axis="x", labelsize=9)
    fig.savefig(OUT / "5-1-ca-kiem-thu-theo-nhom.png", bbox_inches="tight", facecolor=SURF)
    plt.close(fig)


# (module, dòng %, nhánh %) — Bảng 5.7
BAO_PHU = [
    ("ai", 88.3, 76.9),
    ("billing", 86.9, 74.7),
    ("reports", 85.2, 73.6),
    ("booking", 84.0, 77.8),
    ("appointments", 82.0, 71.4),
    ("staff", 74.8, 62.3),
    ("medical-records", 73.6, 72.2),
    ("payroll", 71.5, 60.9),
    ("auth, users, roles", 70.7, 60.8),
    ("patients", 70.5, 67.7),
    ("Các module còn lại", 63.8, 62.8),
    ("Toàn hệ thống", 76.6, 70.0),
]


def hinh_5_2():
    ten = [b[0] for b in BAO_PHU][::-1]  # hàng "Toàn hệ thống" nằm dưới cùng
    dong = [b[1] for b in BAO_PHU][::-1]
    nhanh = [b[2] for b in BAO_PHU][::-1]
    y = range(len(ten))
    h = 0.38
    fig, ax = plt.subplots(figsize=(6.3, 4.4))
    ax.barh([i + h / 2 for i in y], dong, height=h, color=C_UNIT, edgecolor=SURF,
            linewidth=1, label="Theo dòng")
    ax.barh([i - h / 2 for i in y], nhanh, height=h, color=C_API, edgecolor=SURF,
            linewidth=1, hatch="////", label="Theo nhánh")
    plt.rcParams["hatch.color"] = SURF
    for i in y:
        ax.text(dong[i] + 0.8, i + h / 2, so(dong[i], 1), va="center", fontsize=9, color=INK2)
        ax.text(nhanh[i] + 0.8, i - h / 2, so(nhanh[i], 1), va="center", fontsize=9, color=INK2)
    ax.set_yticks(list(y), ten)
    ax.set_xlim(0, 100)
    ax.set_xlabel("Độ bao phủ (%)", fontsize=10)
    don_truc(ax)
    ax.set_ylim(-0.6, len(ten) - 0.4)
    ax.axhline(0.5, color=INK2, linewidth=0.8)
    ax.get_yticklabels()[0].set_fontweight("bold")
    ax.legend(loc="upper center", bbox_to_anchor=(0.42, -0.12), ncol=2, frameon=False,
              fontsize=10)
    fig.savefig(OUT / "5-2-do-bao-phu-theo-module.png", bbox_inches="tight", facecolor=SURF)
    plt.close(fig)


if __name__ == "__main__":
    plt.rcParams["hatch.color"] = SURF
    plt.rcParams["hatch.linewidth"] = 1.0
    hinh_5_1()
    hinh_5_2()
