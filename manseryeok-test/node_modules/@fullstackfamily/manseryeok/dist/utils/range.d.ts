/**
 * 범위 검증 유틸리티
 */
/**
 * 지원 범위 확인
 * @param year 확인할 연도
 * @returns 지원 여부 (1900~2050)
 */
export declare function isSupportedYear(year: number): boolean;
/**
 * 지원 연도 범위 조회
 * @returns { min, max } 지원 범위
 */
export declare function getSupportedRange(): {
    min: number;
    max: number;
};
//# sourceMappingURL=range.d.ts.map