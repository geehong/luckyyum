import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useUserStore } from '../store/userStore';
import { getAdultFallbackLine } from '../data/adultFallbackLines';

// backend/app/routers/live.py 의 /ws/live-talk 릴레이. Gemini API 키는 서버가 들고 있음.
const WS_URL = 'ws://luckyyum.firemarkets.net/ws/live-talk';
const CONNECT_TIMEOUT_MS = 5000;

interface Message {
  id: string;
  role: 'user' | 'pet';
  text: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const LiveTalkScreen = ({ visible, onClose }: Props) => {
  const { finalizedMbti } = useUserStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'connecting' | 'connected' | 'fallback'>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const pendingPetMessageId = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    setMessages([]);
    setStatus('connecting');
    let timedOut = false;

    console.log(`[LiveTalkScreen] connecting to ${WS_URL} ...`);
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    const fallbackToLocal = (reason: string) => {
      console.warn(`[LiveTalkScreen] falling back to local line — reason: ${reason}`);
      setStatus('fallback');
      setMessages((prev) => [
        ...prev,
        { id: `fallback-${Date.now()}`, role: 'pet', text: getAdultFallbackLine(finalizedMbti) },
      ]);
    };

    const timeoutId = setTimeout(() => {
      timedOut = true;
      fallbackToLocal(`connect timeout after ${CONNECT_TIMEOUT_MS}ms (readyState=${ws.readyState})`);
      ws.close();
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      console.log('[LiveTalkScreen] WS onopen — connected, sending init');
      clearTimeout(timeoutId);
      if (timedOut) return;
      setStatus('connected');
      ws.send(JSON.stringify({ type: 'init', mbti: finalizedMbti }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.error) {
          fallbackToLocal(`server sent error: ${data.error}`);
          return;
        }

        if (data.text) {
          // 트랜스크립트가 조각 단위로 스트리밍되므로 같은 턴이면 이어붙임.
          setMessages((prev) => {
            if (pendingPetMessageId.current) {
              return prev.map((m) =>
                m.id === pendingPetMessageId.current ? { ...m, text: m.text + data.text } : m
              );
            }
            const id = `pet-${Date.now()}`;
            pendingPetMessageId.current = id;
            return [...prev, { id, role: 'pet', text: data.text }];
          });
        }

        if (data.done) {
          pendingPetMessageId.current = null;
        }
      } catch {
        // 잘못된 프레임은 무시
      }
    };

    ws.onerror = (event: any) => {
      console.warn('[LiveTalkScreen] WS onerror', event?.message ?? event);
      clearTimeout(timeoutId);
      fallbackToLocal(`onerror: ${event?.message ?? 'unknown'}`);
    };

    ws.onclose = (event: any) => {
      console.log(`[LiveTalkScreen] WS onclose — code=${event?.code}, reason=${event?.reason}, wasClean=${event?.wasClean}`);
      clearTimeout(timeoutId);
    };

    return () => {
      clearTimeout(timeoutId);
      pendingPetMessageId.current = null;
      ws.close();
    };
    // finalizedMbti는 성체 전환 시 한 번 고정되는 값이라 재연결 트리거로 적절함 (일반 재렌더에는 반응하지 않음)
  }, [visible, finalizedMbti]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', text: input };
    setMessages((prev) => [...prev, userMsg]);

    if (status === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'message', text: input }));
    } else {
      // 폴백 모드: 에러를 노출하지 않고 로컬 고정 문구로 조용히 응답
      setMessages((prev) => [
        ...prev,
        { id: `fallback-${Date.now()}`, role: 'pet', text: getAdultFallbackLine(finalizedMbti) },
      ]);
    }
    setInput('');
  };

  const handleClose = () => {
    wsRef.current?.close();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>일상대화 {finalizedMbti ? `(${finalizedMbti})` : ''}</Text>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.closeText}>닫기</Text>
          </TouchableOpacity>
        </View>

        {status === 'connecting' && (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color="#8A2BE2" />
            <Text style={styles.statusText}>연결 중...</Text>
          </View>
        )}
        {status === 'fallback' && (
          <Text style={styles.statusTextWarn}>⚠ AI 연결이 원활하지 않아 기본 대사로 응답 중이에요.</Text>
        )}

        <FlatList
          style={styles.messageList}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.petBubble]}>
              <Text style={item.role === 'user' ? styles.userText : styles.petText}>{item.text}</Text>
            </View>
          )}
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="메시지를 입력하세요"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
            <Text style={styles.sendButtonText}>전송</Text>
          </TouchableOpacity>
        </View>

        {/* 오디오 UI는 뼈대만 — 실제 마이크 캡처/스트리밍/재생 로직은 향후 작업(TODO) */}
        <View style={styles.audioRow}>
          <TouchableOpacity style={styles.audioButton} disabled>
            <Text style={styles.audioButtonText}>🎤 음성 (준비 중)</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8A2BE2',
  },
  closeText: {
    color: '#888',
    fontSize: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
  },
  statusText: {
    color: '#888',
    fontSize: 13,
  },
  statusTextWarn: {
    color: '#D2691E',
    fontSize: 13,
    padding: 10,
  },
  messageList: {
    flex: 1,
    padding: 15,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#4CAF50',
  },
  petBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0E6FA',
  },
  userText: {
    color: '#fff',
  },
  petText: {
    color: '#4B0082',
  },
  inputRow: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#8A2BE2',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  audioRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 8,
  },
  audioButton: {
    padding: 8,
    opacity: 0.5,
  },
  audioButtonText: {
    color: '#888',
    fontSize: 12,
  },
});

export default LiveTalkScreen;
