/**
 * 갑자 계산 모듈
 *
 * 60갑자 데이터를 사용하여 갑자 계산을 수행합니다.
 */
import { getPillarById } from '../data/sixty-pillars';
import type { GapjaResult } from '../types';
export { getPillarById };
/**
 * 갑자 ID(0~59)로 한글/한자 이름 생성
 * @param yearPillarId 년주 ID (0~59)
 * @param monthPillarId 월주 ID (0~59)
 * @param dayPillarId 일주 ID (0~59)
 * @returns 갑자 정보
 */
export declare function formatGapjaByIds(yearPillarId: number, monthPillarId: number, dayPillarId: number): GapjaResult;
/**
 * 한글 갑자로 ID 찾기
 * @param hangul 한글 갑자 (예: "갑자", "을축")
 * @returns 60갑자 ID 또는 undefined
 */
export declare function getPillarIdByHangul(hangul: string): number | undefined;
/**
 * 한자 갑자로 ID 찾기
 * @param hanja 한자 갑자 (예: "甲子", "乙丑")
 * @returns 60갑자 ID 또는 undefined
 */
export declare function getPillarIdByHanja(hanja: string): number | undefined;
//# sourceMappingURL=gapja-calculator.d.ts.map