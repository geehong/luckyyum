/**
 * 24절기 (二十四節氣) 데이터
 *
 * 한국천문연구원(KASI) 데이터 기반
 * 입춘(立春)을 시작으로 24절기를 제공합니다.
 *
 * 절기는 태양의 황경(longitude)을 기준으로 정해지며,
 * 매년 약간의 시간 차이가 있습니다.
 */
export interface SolarTermEntry {
    year: number;
    name: string;
    nameHanja: string;
    index: number;
    longitude: number;
    type: 'jeolgi' | 'junggi';
    sajuMonth: number;
}
/**
 * 한국 24절기 이름과 정보
 *
 * 황경 315°부터 시작하여 15°마다 하나씩, 총 24개
 */
export declare const SOLAR_TERM_NAMES: Array<{
    name: string;
    hanja: string;
    longitude: number;
    type: 'jeolgi' | 'junggi';
    sajuMonth: number;
}>;
/**
 * 절기 인덱스로 절기 정보 조회
 */
export declare function getSolarTermByIndex(index: number): {
    name: string;
    hanja: string;
    longitude: number;
    type: "jeolgi" | "junggi";
    sajuMonth: number;
};
/**
 * 절기 이름으로 절기 정보 조회
 */
export declare function getSolarTermByName(name: string): {
    name: string;
    hanja: string;
    longitude: number;
    type: "jeolgi" | "junggi";
    sajuMonth: number;
} | undefined;
//# sourceMappingURL=solar-terms.d.ts.map