import { NativeModules, Platform } from 'react-native';

const { OverlayModule } = NativeModules;

export interface OverlayModuleType {
  requestOverlayPermission(): Promise<boolean>;
  startOverlay(): void;
  stopOverlay(): void;
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
};

export default OverlayModuleSafe;
