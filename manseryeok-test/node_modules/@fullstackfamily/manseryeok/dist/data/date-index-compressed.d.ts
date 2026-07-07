/**
 * 압축된 양력 → 음력 변환 인덱스
 *
 * ⚠️ 이 파일은 자동 생성됩니다. 직접 수정하지 마세요.
 * 생성: scripts/compress-date-index.ts
 */
import type { SolarToLunarEntry } from '../types';
export interface MonthlyIndex {
    year: number;
    month: number;
    entries: SolarToLunarEntry[];
    startJD: number;
    endJD: number;
}
export declare function getMonthlyIndex(year: number, month: number): MonthlyIndex | undefined;
/** @deprecated getMonthlyIndex() 사용 권장 */
export declare const SOLAR_TO_LUNAR_INDEX: Map<string, MonthlyIndex>;
//# sourceMappingURL=date-index-compressed.d.ts.map