// Thông số ban đầu từ hai dòng có mã Mẫu trong Thamso_RPKL của ThamSo_BaoCao.xlsx.
export const FORESTRY_DEFAULT_ROWS = [
  {
    "Mẫu": "MAU04",
    "Tiêu hao SX": 0.025,
    "Tên thông thường": "Gỗ keo lai",
    "Tên khoa học": "Acacia hybrid",
    "TÊN HH_TKHQ": "Dăm gỗ keo rừng trồng",
    "Đơn vị tính (MT)": "Tấn tươi",
    "Đơn vị tính (BDMT)": "Tấn khô kiệt",
    "Diễn giải hồ sơ nhập": "Phiếu cân, BKLS số",
    "Diễn giải hồ sơ xuất": "PXKKVCNB, Hóa đơn, BKLS số"
  },
  {
    "Mẫu": "MAU14",
    "Tiêu hao SX": 0.025,
    "Tên thông thường": "Gỗ keo lai",
    "Tên khoa học": "Acacia hybrid",
    "TÊN HH_TKHQ": "Dăm gỗ keo rừng trồng",
    "Đơn vị tính (MT)": "Tấn tươi",
    "Đơn vị tính (BDMT)": "Tấn khô kiệt",
    "Diễn giải hồ sơ nhập": "Phiếu cân, BKLS số",
    "Diễn giải hồ sơ xuất": "PXKKVCNB, Hóa đơn, BKLS số"
  }
];

export function normalizeForestryModel(value) {
  const code = value?.trim().toUpperCase();
  return code === 'MAU07' ? 'MAU04' : code;
}
