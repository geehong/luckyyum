// Gemini Live 연결 실패/타임아웃 시에만 쓰이는 최후 폴백 문구.
// AI로 생성하지 않고 코드에 직접 내장 — 품질보다 "항상 즉시 표시 가능"이 우선.
export const ADULT_FALLBACK_LINES: Record<string, string> = {
  ISTJ: '주인님, 오늘 할 일은 다 하셨나요?',
  ISFJ: '주인님 편히 쉬세요, 제가 지켜볼게요.',
  INFJ: '가끔 세상 모든 마음을 다 이해하고 싶어져요.',
  INTJ: '다음 계획은 이미 세워뒀어요.',
  ISTP: '그거, 제가 한번 뜯어봐도 될까요?',
  ISFP: '오늘 하늘 색깔 진짜 예쁘네요.',
  INFP: '주인님, 우리의 인연은 운명 같아요.',
  INTP: '주인님, 우주의 끝은 어디일까요?',
  ESTP: '심심한데 밖에 나가서 뭐라도 하죠!',
  ESFP: '오늘 같이 신나게 놀아요!',
  ENFP: '새로운 모험을 떠나볼까요, 주인님?',
  ENTP: '이거 완전 다르게 해볼 수도 있을 것 같은데요?',
  ESTJ: '주인님, 오늘 일정 정리해드릴까요?',
  ESFJ: '다들 잘 지내고 있는지 걱정되네요.',
  ENFJ: '주인님이 행복해야 저도 행복해요.',
  ENTJ: '제가 이 집의 계획을 이끌어볼게요.',
};

const DEFAULT_LINE = '주인님, 오늘도 좋은 하루예요!';

export function getAdultFallbackLine(mbti: string | null): string {
  if (!mbti) return DEFAULT_LINE;
  return ADULT_FALLBACK_LINES[mbti] ?? DEFAULT_LINE;
}
