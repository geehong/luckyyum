// Jest 환경(Node)에는 MMKV 네이티브 모듈이 없으므로, 순수 JS 인메모리 구현으로 대체.
// zustand persist 어댑터가 쓰는 set/getString/remove 세 메서드만 흉내내면 충분하다.
function createMMKV() {
  const map = new Map();
  return {
    set: (key, value) => {
      map.set(key, value);
    },
    getString: (key) => (map.has(key) ? map.get(key) : undefined),
    remove: (key) => {
      map.delete(key);
    },
  };
}

module.exports = { createMMKV };
