/**
 * 사주팔자 계산 모듈
 *
 * 사주팔자(년주, 월주, 일주, 시주)를 계산합니다.
 */
import type { GapjaResult } from '../types';
/**
 * 사주팔자 타입
 */
export interface SajuResult {
    /** 년주 (년柱) */
    yearPillar: string;
    /** 년주 한자 */
    yearPillarHanja: string;
    /** 월주 (월柱) */
    monthPillar: string;
    /** 월주 한자 */
    monthPillarHanja: string;
    /** 일주 (일柱) */
    dayPillar: string;
    /** 일주 한자 */
    dayPillarHanja: string;
    /** 시주 (시柱) - 시간 미입력 시 null */
    hourPillar: string | null;
    /** 시주 한자 */
    hourPillarHanja: string | null;
    /** 원본 갑자 정보 */
    gapja: GapjaResult;
    /** 시간 보정이 적용되었는지 여부 */
    isTimeCorrected: boolean;
    /** 보정된 시간 (분 단위) */
    correctedTime?: {
        hour: number;
        minute: number;
    };
}
/**
 * 사주 계산 옵션
 */
export interface SajuOptions {
    /** 경도 (기본값: 127 - 서울) */
    longitude?: number;
    /** 시간 보정 적용 여부 (기본값: true) */
    applyTimeCorrection?: boolean;
}
/**
 * 사주팔자 계산
 *
 * @param solarYear 양력 년
 * @param solarMonth 양력 월 (1~12)
 * @param solarDay 양력 일 (1~31)
 * @param solarHour 양력 시 (0~23)
 * @param solarMinute 양력 분 (0~59, 기본값: 0)
 * @param options 사주 계산 옵션
 * @returns 사주팔자 정보
 */
export declare function calculateSaju(solarYear: number, solarMonth: number, solarDay: number, solarHour?: number, solarMinute?: number, options?: SajuOptions): SajuResult;
/**
 * 간단한 사주 계산 (시간 보정 없음)
 *
 * @param solarYear 양력 년
 * @param solarMonth 양력 월 (1~12)
 * @param solarDay 양력 일 (1~31)
 * @param solarHour 양력 시 (0~23, 선택사항)
 * @returns 사주팔자 정보
 */
export declare function calculateSajuSimple(solarYear: number, solarMonth: number, solarDay: number, solarHour?: number): SajuResult;
//# sourceMappingURL=saju.d.ts.map