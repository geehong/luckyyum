/**
 * 양력 ↔ 음력 변환 모듈
 *
 * 만세력 인덱스를 사용하여 양력과 음력 간 변환을 수행합니다.
 */
import type { SolarToLunarResult, LunarToSolarResult } from '../types';
/**
 * 양력 → 음력 변환
 * @param solarYear 양력 년 (1000~2050)
 * @param solarMonth 양력 월 (1~12)
 * @param solarDay 양력 일 (1~31)
 * @returns 음력 날짜와 갑자 정보
 * @throws {OutOfRangeError} 지원 범위 밖 연도
 * @throws {InvalidDateError} 유효하지 않은 날짜
 */
export declare function solarToLunar(solarYear: number, solarMonth: number, solarDay: number): SolarToLunarResult;
/**
 * 음력 → 양력 변환
 * @param lunarYear 음력 년 (1000~2050)
 * @param lunarMonth 음력 월 (1~12)
 * @param lunarDay 음력 일 (1~30)
 * @param isLeapMonth 윤달 여부
 * @returns 양력 날짜와 갑자 정보
 * @throws {OutOfRangeError} 지원 범위 밖 연도
 * @throws {InvalidDateError} 유효하지 않은 날짜
 */
export declare function lunarToSolar(lunarYear: number, lunarMonth: number, lunarDay: number, isLeapMonth?: boolean): LunarToSolarResult;
/**
 * 특정 날짜의 갑자 계산
 * @param solarYear 양력 년
 * @param solarMonth 양력 월
 * @param solarDay 양력 일
 * @returns 갑자 정보
 */
export declare function getGapja(solarYear: number, solarMonth: number, solarDay: number): import('../types').GapjaResult;
//# sourceMappingURL=solar-lunar-converter.d.ts.map