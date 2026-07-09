import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { usePetStore } from '../store/petStore';
import { useActivityStore } from '../store/activityStore';
import dialoguesData from '../data/dialogues.json';

interface DialogueChoice {
  text: string;
  trait: string;
}

interface DialogueItem {
  id: string;
  situation: string;
  choices: DialogueChoice[];
}

const dialogues = dialoguesData as DialogueItem[];
const ONE_HOUR_MS = 60 * 60 * 1000;

interface Props {
  visible: boolean;
  onClose: () => void;
}

const PetDialogue = ({ visible, onClose }: Props) => {
  const { answerDialogue } = usePetStore();
  const { dailyDialogueUsage } = useActivityStore();
  const [current, setCurrent] = useState<DialogueItem | null>(null);
  const [answeredText, setAnsweredText] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const usage = dailyDialogueUsage && dailyDialogueUsage.date === today
    ? dailyDialogueUsage
    : { date: today, count: 0, lastDialogueTime: 0 };
  const isDailyCapped = usage.count >= 5;
  const cooldownRemainingMs = usage.lastDialogueTime
    ? ONE_HOUR_MS - (Date.now() - usage.lastDialogueTime)
    : 0;
  const isBlocked = isDailyCapped || cooldownRemainingMs > 0;

  useEffect(() => {
    if (visible && !isBlocked && dialogues.length > 0) {
      const random = dialogues[Math.floor(Math.random() * dialogues.length)];
      setCurrent(random);
      setAnsweredText(null);
    }
    // isBlocked는 매 렌더마다 Date.now() 기준으로 새로 계산되는 파생값 — 모달이 새로 열릴 때만
    // 한 번 질문을 뽑고 싶어서 의도적으로 visible에만 반응하도록 함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleChoice = (choice: DialogueChoice) => {
    answerDialogue([choice.trait]);
    setAnsweredText('고마워요, 주인님! 조금 더 저를 알게 된 것 같아요.');
  };

  const handleClose = () => {
    setCurrent(null);
    setAnsweredText(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>성향 대화</Text>

          {isBlocked ? (
            <Text style={styles.bodyText}>
              {isDailyCapped
                ? '오늘은 대화를 너무 많이 해서 지쳤어요... (내일 다시 시도해주세요)'
                : '조금 전에 대화했어요. 잠시 후에 다시 말 걸어주세요.'}
            </Text>
          ) : answeredText ? (
            <Text style={styles.bodyText}>{answeredText}</Text>
          ) : current ? (
            <>
              <Text style={styles.bodyText}>{current.situation}</Text>
              {current.choices.map((choice, idx) => (
                <TouchableOpacity key={idx} style={styles.choiceButton} onPress={() => handleChoice(choice)}>
                  <Text style={styles.choiceText}>{choice.text}</Text>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <Text style={styles.bodyText}>아직 물어볼 질문이 없어요.</Text>
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
    color: '#8A2BE2',
  },
  bodyText: {
    fontSize: 15,
    color: '#333',
    marginBottom: 15,
    lineHeight: 22,
  },
  choiceButton: {
    backgroundColor: '#F0E6FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  choiceText: {
    fontSize: 14,
    color: '#4B0082',
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

export default PetDialogue;
