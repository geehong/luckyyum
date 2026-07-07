import { calculateSaju } from 'ssaju';

export interface ManseryeokInput {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;  // 0-23
  minute: number; // 0-59
  gender: '남' | '여';
}

export interface ManseryeokResult {
  dayMaster: string;          // 일간 (천간)
  dayMasterElement: string;   // 일간의 오행 (목, 화, 토, 금, 수)
  ohaengCounts: {             // 오행 개수
    목: number;
    화: number;
    토: number;
    금: number;
    수: number;
  };
  ganzhi: {                   // 사주 원국
    year: string;
    month: string;
    day: string;
    hour: string;
  };
  compact: string;            // LLM 전달용 압축 포맷
}

export function getManseryeokData(input: ManseryeokInput): ManseryeokResult {
  const saju = calculateSaju({
    year: input.year,
    month: input.month,
    day: input.day,
    hour: input.hour,
    minute: input.minute,
    gender: input.gender,
  });

  const dayMaster = saju.dayStem; // 예: '丙'
  
  // 천간별 오행 매핑
  const elementMap: Record<string, string> = {
    '甲': '목', '乙': '목',
    '丙': '화', '丁': '화',
    '戊': '토', '己': '토',
    '庚': '금', '辛': '금',
    '壬': '수', '癸': '수'
  };

  const dayMasterElement = elementMap[dayMaster] || '알수없음';

  return {
    dayMaster,
    dayMasterElement,
    ohaengCounts: {
      목: saju.fiveElements.목 || 0,
      화: saju.fiveElements.화 || 0,
      토: saju.fiveElements.토 || 0,
      금: saju.fiveElements.금 || 0,
      수: saju.fiveElements.수 || 0,
    },
    ganzhi: {
      year: saju.pillars.year,
      month: saju.pillars.month,
      day: saju.pillars.day,
      hour: saju.pillars.hour,
    },
    compact: saju.toCompact()
  };
}
