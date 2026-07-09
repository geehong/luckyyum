import { getManseryeokData } from '../src/utils/manseryeok';

describe('Manseryeok Edge Case Tests', () => {
  it('자시(23:00~01:00) 입력 시 일주(day)가 정상적으로 익일로 넘어가는지 테스트', () => {
    // 1990년 1월 1일은 기사년 병자월 을축일.
    // 23:45 입력 시 야자시 적용으로 병인일 무자시로 넘어가야 함.
    const result = getManseryeokData({
      year: 1990,
      month: 1,
      day: 1,
      hour: 23,
      minute: 45,
      gender: '남',
    });

    expect(result.ganzhi.year).toBe('己巳');
    expect(result.ganzhi.month).toBe('丙子');
    expect(result.ganzhi.day).toBe('丙寅'); // 23:45는 아직 당일(병인)로 처리됨
    expect(result.ganzhi.hour).toBe('戊子'); // 시간은 자시
    expect(result.dayMaster).toBe('丙');
  });

  it('자정(00:15) 입력 시 일주(day)가 정상적으로 익일로 넘어가는지 테스트', () => {
    // 1990년 1월 2일 00:15
    const result = getManseryeokData({
      year: 1990,
      month: 1,
      day: 2,
      hour: 0,
      minute: 15,
      gender: '남',
    });

    expect(result.ganzhi.year).toBe('己巳');
    expect(result.ganzhi.month).toBe('丙子');
    expect(result.ganzhi.day).toBe('丁卯'); // 익일(정묘)로 정상 적용
    expect(result.ganzhi.hour).toBe('庚子'); // 시간은 자시
    expect(result.dayMaster).toBe('丁');
  });

  it('일반 시간 입력 시 당일의 일진이 나오는지 테스트', () => {
    // 1990년 1월 1일 12:00
    const result = getManseryeokData({
      year: 1990,
      month: 1,
      day: 1,
      hour: 12,
      minute: 0,
      gender: '남',
    });

    expect(result.ganzhi.year).toBe('己巳');
    expect(result.ganzhi.month).toBe('丙子');
    expect(result.ganzhi.day).toBe('丙寅'); // 당일 일진
    expect(result.ganzhi.hour).toBe('甲午');
    expect(result.dayMaster).toBe('丙');
  });
});
