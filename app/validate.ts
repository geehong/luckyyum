import { getManseryeokData } from './src/utils/manseryeok';

console.log("=== Edge Case 1: 자시(23:45) 입력 테스트 ===");
const r1 = getManseryeokData({
  year: 1990,
  month: 1,
  day: 1,
  hour: 23,
  minute: 45,
  gender: '남',
});
console.log("입력: 1990-01-01 23:45 (기사년 병자월 을축일)");
console.log("출력 일주:", r1.ganzhi.day, r1.ganzhi.day === '丙寅' ? "✅ 자시 경계 정상 동작 (익일 적용)" : "❌ 실패");
console.log("일간(Day Master):", r1.dayMaster);
console.log("일간 오행:", r1.dayMasterElement);
console.log("오행 개수:", r1.ohaengCounts);

console.log("\n=== Edge Case 2: 일반 시간 입력 테스트 ===");
const r2 = getManseryeokData({
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  minute: 0,
  gender: '남',
});
console.log("입력: 1990-01-01 12:00 (기사년 병자월 을축일)");
console.log("출력 일주:", r2.ganzhi.day, r2.ganzhi.day === '乙丑' ? "✅ 정상 동작 (당일 적용)" : "❌ 실패");
console.log("일간(Day Master):", r2.dayMaster);
console.log("일간 오행:", r2.dayMasterElement);
console.log("오행 개수:", r2.ohaengCounts);
