/**
 * 절기 계산 모듈
 *
 * 한국 24절기 정보를 제공합니다.
 */
import { SOLAR_TERM_NAMES } from '../data/solar-terms';
/**
 * 절기 시각 정보 (날짜 포함)
 */
export interface SolarTermWithDate {
    name: string;
    nameHanja: string;
    index: number;
    longitude: number;
    type: 'jeolgi' | 'junggi';
    sajuMonth: number;
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
}
/**
 * 24절기 기본 정보 조회
 * @returns 24절기 정보 배열
 */
export declare function getAllSolarTerms(): typeof SOLAR_TERM_NAMES;
/**
 * 절기 인덱스로 기본 정보 조회
 * @param index 절기 인덱스 (0~23)
 * @returns 절기 기본 정보
 */
export declare function getSolarTermInfoByIndex(index: number): {
    name: string;
    hanja: string;
    longitude: number;
    type: "jeolgi" | "junggi";
    sajuMonth: number;
};
/**
 * 절기 이름으로 기본 정보 조회
 * @param name 절기 이름 (예: '입춘', '경칩')
 * @returns 절기 기본 정보 또는 undefined
 */
export declare function getSolarTermInfoByName(name: string): {
    name: string;
    hanja: string;
    longitude: number;
    type: "jeolgi" | "junggi";
    sajuMonth: number;
} | undefined;
/**
 * 사주 월에 해당하는 절기 목록 조회
 * @param sajuMonth 사주 월 (1~12)
 * @returns 해당 월의 절기 목록
 */
export declare function getSolarTermsBySajuMonth(sajuMonth: number): typeof SOLAR_TERM_NAMES;
/**
 * 특정 연도의 모든 절기 조회 (시각 포함)
 * @param year 연도 (2020~2030)
 * @returns 해당 연도의 24절기 시각 정보
 */
export declare function getSolarTermsByYear(year: number): SolarTermWithDate[];
/**
 * 특정 날짜의 절기 조회 (±1일 이내)
 * @param year 연도
 * @param month 월 (1~12)
 * @param day 일 (1~31)
 * @returns 해당 날짜의 절기 정보 또는 null
 */
export declare function getSolarTermForDate(year: number, month: number, day: number): SolarTermWithDate | null;
/**
 * 특정 월의 모든 절기 조회
 * @param year 연도
 * @param month 월 (1~12)
 * @returns 해당 월의 절기 목록
 */
export declare function getSolarTermsByMonth(year: number, month: number): SolarTermWithDate[];
/**
 * 지원되는 절기 연도 목록 조회
 * @returns 지원되는 연도 배열
 */
export declare function getSupportedSolarTermYears(): number[];
/**
 * 현재 날짜가 속한 사주 월 계산
 *
 * @description
 * 사주에서 월주는 절기(節氣)를 기준으로 계산합니다.
 * 입춘(立春, 황경 315°)부터 2월, 경칩(驚蟄, 황경 345°)부터 3월, ...
 *
 * @param month 양력 월 (1~12)
 * @param day 양력 일 (1~31)
 * @returns 사주 월 (1~12)
 */
export declare function getSajuMonth(month: number, day: number): number;
/**
 * 입춘 이전인지 확인 (년주 결정에 사용)
 * @param month 양력 월
 * @param day 양력 일
 * @returns 입춘 이전이면 true
 */
export declare function isBeforeLichun(month: number, day: number): boolean;
//# sourceMappingURL=solar-term.d.ts.map