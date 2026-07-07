/**
 * 60갑자 데이터
 *
 * 갑자(Gapja)는 천간(10개)과 지지(12개)의 조합으로 만들어지는 60개의 조합입니다.
 * 60년을 주기로 순환하며, 년주/월주/일주 계산에 사용됩니다.
 */
export interface SixtyPillar {
    id: number;
    tiangan: {
        id: number;
        hangul: string;
        hanja: string;
        romanization?: string;
        element: string;
    };
    dizhi: {
        id: number;
        hangul: string;
        hanja: string;
        romanization?: string;
        animal: string;
        element: string;
    };
    combined: {
        hangul: string;
        hanja: string;
        romanization?: string;
    };
    element: string;
    yinYang: string;
}
/**
 * 60갑자 전체 배열
 */
export declare const SIXTY_PILLARS: readonly SixtyPillar[];
/**
 * ID로 60갑자 조회
 * @param id 0~59
 * @returns 60갑자 정보
 */
export declare function getPillarById(id: number): SixtyPillar;
/**
 * 한글 갑자로 60갑자 조회
 * @param hangul 갑자 (예: "갑자", "을축")
 * @returns 60갑자 정보 또는 undefined
 */
export declare function getPillarByHangul(hangul: string): SixtyPillar | undefined;
//# sourceMappingURL=sixty-pillars.d.ts.map