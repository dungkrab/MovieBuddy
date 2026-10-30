// ข้อมูลสาขาตัวอย่าง (พิกัด/ที่อยู่โดยประมาณ ใช้สำหรับพัฒนาเท่านั้น)
export type CinemaSeed = {
  chain: "MAJOR" | "SF"; name: string; provinceCode: string; districtCode: string;
  address: string; lat: number; lng: number;
};
export const cinemas: CinemaSeed[] = [
  { chain: "MAJOR", name: "Major Cineplex Paragon", provinceCode: "10", districtCode: "1007", address: "สยามพารากอน ปทุมวัน กรุงเทพฯ", lat: 13.7461, lng: 100.5347 },
  { chain: "MAJOR", name: "Major Cineplex รัชโยธิน", provinceCode: "10", districtCode: "1030", address: "จตุจักร กรุงเทพฯ", lat: 13.8286, lng: 100.5686 },
  { chain: "SF", name: "SF World Cinema เซ็นทรัลเวิลด์", provinceCode: "10", districtCode: "1007", address: "เซ็นทรัลเวิลด์ ปทุมวัน กรุงเทพฯ", lat: 13.7466, lng: 100.5393 },
  { chain: "SF", name: "SF Cinema เอ็มโพเรียม", provinceCode: "10", districtCode: "1033", address: "ดิ เอ็มโพเรียม คลองเตย กรุงเทพฯ", lat: 13.7305, lng: 100.5697 },
  { chain: "SF", name: "SF Cinema MBK Center", provinceCode: "10", districtCode: "1007", address: "MBK Center ปทุมวัน กรุงเทพฯ", lat: 13.7446, lng: 100.53 },
  { chain: "MAJOR", name: "Major Cineplex สุขุมวิท (เอกมัย)", provinceCode: "10", districtCode: "1039", address: "สุขุมวิท วัฒนา กรุงเทพฯ", lat: 13.7197, lng: 100.5849 },
  { chain: "SF", name: "SF Cinema เซ็นทรัล ลาดพร้าว", provinceCode: "10", districtCode: "1030", address: "เซ็นทรัล ลาดพร้าว จตุจักร กรุงเทพฯ", lat: 13.816, lng: 100.5617 },
  { chain: "SF", name: "SF Cinema เซ็นทรัล พระราม 3", provinceCode: "10", districtCode: "1012", address: "ยานนาวา กรุงเทพฯ", lat: 13.6988, lng: 100.5389 },
  { chain: "SF", name: "SF Cinema เซ็นทรัล ปิ่นเกล้า", provinceCode: "10", districtCode: "1020", address: "บางกอกน้อย กรุงเทพฯ", lat: 13.7778, lng: 100.4777 },
  { chain: "MAJOR", name: "Major Cineplex เมกาบางนา", provinceCode: "11", districtCode: "1103", address: "เมกาบางนา บางพลี สมุทรปราการ", lat: 13.6466, lng: 100.68 },
  { chain: "MAJOR", name: "Major Cineplex รังสิต", provinceCode: "13", districtCode: "1303", address: "ฟิวเจอร์พาร์ค รังสิต ธัญบุรี ปทุมธานี", lat: 13.9893, lng: 100.6174 },
  { chain: "SF", name: "SF Cinema เซ็นทรัล เวสต์เกต", provinceCode: "12", districtCode: "1203", address: "บางใหญ่ นนทบุรี", lat: 13.8776, lng: 100.4128 },
  { chain: "SF", name: "SF Cinema เซ็นทรัล เฟสติวัล เชียงใหม่", provinceCode: "50", districtCode: "5001", address: "เมืองเชียงใหม่ เชียงใหม่", lat: 18.8085, lng: 99.0147 },
  { chain: "MAJOR", name: "Major Cineplex เซ็นทรัล แอร์พอร์ต เชียงใหม่", provinceCode: "50", districtCode: "5001", address: "เมืองเชียงใหม่ เชียงใหม่", lat: 18.7667, lng: 98.9669 },
  { chain: "SF", name: "SF Cinema เซ็นทรัล ขอนแก่น", provinceCode: "40", districtCode: "4001", address: "เมืองขอนแก่น ขอนแก่น", lat: 16.4326, lng: 102.829 },
  { chain: "MAJOR", name: "Major Cineplex ขอนแก่น", provinceCode: "40", districtCode: "4001", address: "เมืองขอนแก่น ขอนแก่น", lat: 16.439, lng: 102.8365 },
  { chain: "MAJOR", name: "Major Cineplex เซ็นทรัล ภูเก็ต", provinceCode: "83", districtCode: "8301", address: "เมืองภูเก็ต ภูเก็ต", lat: 7.8918, lng: 98.365 },
  { chain: "SF", name: "SF Cinema จังซีลอน ป่าตอง", provinceCode: "83", districtCode: "8302", address: "กะทู้ ภูเก็ต", lat: 7.896, lng: 98.296 },
];
