/**
 * 양력 → 음력 변환 인덱스
 *
 * 월별로 분할된 인덱스 구조로 빠른 조회 성능을 제공합니다.
 * 원본 데이터: manseryeok_dates 테이블
 * 레코드 수: 55,151
 */
import type { SolarToLunarEntry } from '../types';
/**
 * 월별 인덱스 엔트리
 */
export interface MonthlyIndex {
    year: number;
    month: number;
    entries: SolarToLunarEntry[];
    startJD: number;
    endJD: number;
}
/**
 * 양력 → 음력 변환 인덱스 (월별 분할)
 *
 * 사용법:
 * ```ts
 * const key = '2024-01';
 * const monthIndex = SOLAR_TO_LUNAR_INDEX.get(key);
 * const entry = monthIndex.entries.find(e =>
 *   e.solar.year === 2024 && e.solar.month === 1 && e.solar.day === 1
 * );
 * ```
 */
export declare const SOLAR_TO_LUNAR_INDEX: Map<string, MonthlyIndex>;
/**
 * 특정 월의 인덱스 조회
 * @param year 양력 년
 * @param month 양력 월
 * @returns 월별 인덱스 또는 undefined
 */
export declare function getMonthlyIndex(year: number, month: number): MonthlyIndex | undefined;
//# sourceMappingURL=date-index.d.ts.map