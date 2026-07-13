import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { usePetStore } from '../store/petStore';
import { calculateMBTI } from '../utils/mbtiCalculator';
import { calculateFortuneTier, getMockFortuneText } from '../utils/fortuneLogic';
import BarSvg from '../../android/app/src/main/res/drawable/layout_svg/bar.svg';

interface Props {
  visible: boolean;
  onClose: () => void;
  userProfile: any;
  dailyFortuneLock: any;
}

const GaugeBar = ({ label, value }: { label: string; value: number }) => {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.gaugeRow}>
      <View style={styles.gaugeHeader}>
        <Text style={styles.gaugeLabel}>{label}</Text>
        <Text style={styles.gaugeValue}>{value}/100</Text>
      </View>
      <View style={styles.gaugeTrackInnerShadow}>
        <View style={{ width: `${clamped}%`, height: '100%', overflow: 'hidden' }}>
          <View style={{ width: 263, height: 25 }}>
            <BarSvg width="100%" height="100%" preserveAspectRatio="none" />
          </View>
        </View>
      </View>
    </View>
  );
};

const StatusScreen = ({ visible, onClose, userProfile, dailyFortuneLock }: Props) => {
  const {
    physical_fullness, spirit_intimacy, physical_cleanliness, physical_weight,
    spirit_happiness, env_poopCount, physical_health
  } = usePetStore();

  const currentMBTI = calculateMBTI(usePetStore.getState());
  const finalFortuneTier = calculateFortuneTier(usePetStore.getState(), dailyFortuneLock ? dailyFortuneLock.baseTier : 3);
  const fortuneText = getMockFortuneText(finalFortuneTier, '甲', '子');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screenContainer}>
        <Text style={[styles.title, { marginBottom: 25, marginTop: 40 }]}>📊 상세 상태</Text>
        <View style={styles.content}>
          <GaugeBar label="🍖 포만감" value={physical_fullness} />
          <GaugeBar label="💖 친밀도" value={spirit_intimacy} />
          <GaugeBar label="✨ 청결도" value={physical_cleanliness} />
          <GaugeBar label="⚖️ 몸무게" value={physical_weight} />
          <GaugeBar label="😊 행복도" value={spirit_happiness} />
          
          <View style={styles.statsTextRow}>
            {env_poopCount > 0 && <Text style={styles.statText}>💩 응가: {env_poopCount}개</Text>}
            <Text style={styles.statText}>{physical_health === 'sick' ? '🤒 건강: 아픔' : '💪 건강: 양호'}</Text>
            <Text style={styles.mbtiText}>🧠 MBTI: {currentMBTI}</Text>
          </View>
          
          <View style={[styles.fortuneCard, { marginTop: 25 }]}>
            <Text style={styles.fortuneTitle}>오늘의 운세 (등급: {finalFortuneTier})</Text>
            <Text style={styles.fortuneDesc}>{fortuneText}</Text>
          </View>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
  },
  gaugeRow: {
    marginBottom: 15,
  },
  gaugeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  gaugeLabel: {
    fontSize: 14,
    color: '#444',
    fontWeight: 'bold',
  },
  gaugeValue: {
    fontSize: 12,
    color: '#888',
  },
  gaugeTrackInnerShadow: {
    height: 25,
    backgroundColor: '#EEECFF',
    borderRadius: 17.5,
    borderWidth: 1,
    borderTopColor: '#d6d3f0',
    borderLeftColor: '#d6d3f0',
    borderBottomColor: '#ffffff',
    borderRightColor: '#ffffff',
    overflow: 'hidden',
  },
  statsTextRow: {
    marginTop: 10,
    gap: 8,
  },
  statText: {
    fontSize: 15,
    color: '#444',
    fontWeight: 'bold',
  },
  mbtiText: {
    fontSize: 15,
    color: '#6A1B9A',
    fontWeight: 'bold',
  },
  fortuneCard: {
    backgroundColor: '#FFF9C4',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FBC02D',
  },
  fortuneTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E65100',
    marginBottom: 5,
  },
  fortuneDesc: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  closeButton: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 40,
  },
  closeButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default StatusScreen;
