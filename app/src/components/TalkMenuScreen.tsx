import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useUserStore } from '../store/userStore';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectPersonality: () => void; // 유년기: 성향 대화(MBTI 판별) / 성체: 일상대화(Gemini Live)
  onSelectCheckIn: () => void;
}

const TalkMenuScreen = ({ visible, onClose, onSelectPersonality, onSelectCheckIn }: Props) => {
  const { petStage } = useUserStore();
  const isAdult = petStage === 'adult';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>무엇을 할까요?</Text>

          <TouchableOpacity style={styles.choiceButton} onPress={onSelectPersonality}>
            <Text style={styles.choiceText}>{isAdult ? '💬 일상대화' : '🧠 성향 대화'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.choiceButton} onPress={onSelectCheckIn}>
            <Text style={styles.choiceText}>🤗 안부 묻기</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
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
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    elevation: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  choiceButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
  },
  choiceText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  closeButton: {
    marginTop: 5,
    alignItems: 'center',
    padding: 10,
  },
  closeButtonText: {
    color: '#888',
    fontSize: 14,
  },
});

export default TalkMenuScreen;
