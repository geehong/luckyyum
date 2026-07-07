/**
 * 연도별 절기(절기시각) 데이터
 *
 * 한국천문연구원(KASI) 데이터 기반
 * 현재 2020~2030년 데이터 포함
 */
import type { SolarTermDateTime } from '../types';
export declare const SOLAR_TERMS_DATA: Record<number, SolarTermDateTime[]>;
export declare const SUPPORTED_SOLAR_TERM_YEARS: readonly [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];
export type SupportedSolarTermYear = typeof SUPPORTED_SOLAR_TERM_YEARS[number];
//# sourceMappingURL=solar-terms-data.d.ts.map