import { NativeModules, Platform } from 'react-native';

const { OverlayModule } = NativeModules;

export interface OverlayModuleType {
  requestOverlayPermission(): Promise<boolean>;
  startOverlay(): void;
  stopOverlay(): void;
  getInitialRoute(): Promise<string | null>;
}

const OverlayModuleSafe: OverlayModuleType = {
  requestOverlayPermission: async () => {
    if (Platform.OS === 'android' && OverlayModule) {
      return await OverlayModule.requestOverlayPermission();
    }
    return false;
  },
  startOverlay: () => {
    if (Platform.OS === 'android' && OverlayModule) {
      OverlayModule.startOverlay();
    }
  },
  stopOverlay: () => {
    if (Platform.OS === 'android' && OverlayModule) {
      OverlayModule.stopOverlay();
    }
  },
  // 오버레이 롱프레스 메뉴("말걸기"/"상태보기")에서 넘어온 intent extra(overlay_route)를 읽는다.
  // 네이티브 측 구현(MainActivity.kt/OverlayModule.kt)은 이 프로젝트에서 컴파일/기기 검증이 불가해
  // 코드만 작성된 상태 — 모듈이 없거나 값이 없으면 안전하게 null을 반환한다.
  getInitialRoute: async () => {
    if (Platform.OS === 'android' && OverlayModule && OverlayModule.getInitialRoute) {
      return await OverlayModule.getInitialRoute();
    }
    return null;
  },
};

export default OverlayModuleSafe;
