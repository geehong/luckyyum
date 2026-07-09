import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { usePetStore } from '../store/petStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

// v1 스코프: 순수 조회/플레이버 전용 — 기존 스탯을 읽어서 대사로만 답하고, 스탯 자체는 바꾸지 않음.
// "아픈데는 없어?"는 아직 별도 health 스탯이 없어 fullness+cleanliness+isDead를 종합한 컨디션 문구로 대체.
const getConditionLine = (fullness: number, cleanliness: number, isDead: boolean) => {
  if (isDead) return '...';
  if (fullness < 30 || cleanliness < 30) return '음... 몸이 좀 찌뿌둥해요. 밥도 부족하고 씻지도 못했거든요 😢';
  if (fullness >= 70 && cleanliness >= 70) return '완전 쌩쌩해요! 걱정 마세요 😊';
  return '그럭저럭 괜찮아요!';
};

const getHungerLine = (fullness: number) => {
  if (fullness < 30) return '배고파요, 밥 주세요 🥺';
  if (fullness >= 70) return '든든해요!';
  return '그냥 그래요.';
};

const getCleanlinessLine = (cleanliness: number) => {
  if (cleanliness < 30) return '음... 저 좀 더러운 것 같아요, 목욕시켜주세요 🛁';
  if (cleanliness >= 70) return '깨끗해요! 걱정 마세요 ✨';
  return '적당해요.';
};

const CheckInScreen = ({ visible, onClose }: Props) => {
  const { physical_fullness, physical_cleanliness, isDead } = usePetStore();
  const [responseText, setResponseText] = useState<string | null>(null);

  const questions = [
    { label: '아픈데는 없어?', getResponse: () => getConditionLine(physical_fullness, physical_cleanliness, isDead) },
    { label: '배는 안고파?', getResponse: () => getHungerLine(physical_fullness) },
    { label: '집은 안더러워?', getResponse: () => getCleanlinessLine(physical_cleanliness) },
  ];

  const handleClose = () => {
    setResponseText(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>안부 묻기</Text>

          {responseText ? (
            <>
              <Text style={styles.responseText}>{responseText}</Text>
              <TouchableOpacity style={styles.choiceButton} onPress={() => setResponseText(null)}>
                <Text style={styles.choiceText}>다른 질문하기</Text>
              </TouchableOpacity>
            </>
          ) : (
            questions.map((q) => (
              <TouchableOpacity key={q.label} style={styles.choiceButton} onPress={() => setResponseText(q.getResponse())}>
                <Text style={styles.choiceText}>{q.label}</Text>
              </TouchableOpacity>
            ))
          )}

          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    elevation: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    color: '#2E8B57',
  },
  responseText: {
    fontSize: 15,
    color: '#333',
    marginBottom: 15,
    lineHeight: 22,
  },
  choiceButton: {
    backgroundColor: '#E6F5EC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  choiceText: {
    fontSize: 14,
    color: '#1B5E3C',
  },
  closeButton: {
    marginTop: 10,
    alignItems: 'center',
    padding: 10,
  },
  closeButtonText: {
    color: '#888',
    fontSize: 14,
  },
});

export default CheckInScreen;
