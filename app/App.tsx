import React, { useEffect, useState } from 'react';
import { AppState, SafeAreaView, StyleSheet, Text, View, Switch, Button, Alert, TouchableOpacity, Modal, FlatList, TextInput } from 'react-native';
import { useUserStore } from './src/store/userStore';
import { usePetStore } from './src/store/petStore';
import { useActivityStore } from './src/store/activityStore';
import { migrateOldStorage } from './src/store/migrateStorage';
import OverlayModuleSafe from './src/modules/OverlayModule';
import PetRenderer from './src/components/PetRenderer';
import PetDialogue from './src/components/PetDialogue';
import CheckInScreen from './src/components/CheckInScreen';
import TalkMenuScreen from './src/components/TalkMenuScreen';
import LiveTalkScreen from './src/components/LiveTalkScreen';
import { syncOfflineTime, timeTravelForward } from './src/utils/timeSync';
import { calculateMBTI } from './src/utils/mbtiCalculator';
import { calculateFortuneTier, getMockFortuneText, generateTodayBaseTier } from './src/utils/fortuneLogic';
import { fetchRankings } from './src/utils/apiClient';
import petQuestsData from './src/data/petQuests.json';

// 1. Run migration before app initializes
migrateOldStorage();

const App = () => {
  const { userProfile, setUserProfile, isOverlayActive, setOverlayActive } = useUserStore();
  const {
    petName, setPetName, setDailyFortuneLock,
    physical_fullness, spirit_intimacy, physical_cleanliness, physical_weight,
    physical_health, physical_medicineDoses, spirit_happiness, spirit_activeQuest,
    env_poopCount,
    isDead, petStage, feed, play, clean, bathe, pet, giveMedicine, vaccinate,
    dailyFortuneLock,
    hatchEgg, gachaEgg, memorials, syncToServer
  } = usePetStore();

  const activeQuestText = spirit_activeQuest
    ? petQuestsData.find((q) => q.id === spirit_activeQuest.questId)?.text ?? null
    : null;

  const [isLeaderboardVisible, setLeaderboardVisible] = useState(false);
  const [isMemorialVisible, setMemorialVisible] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);


  // M3 대화 & 안부 묻기 화면 라우팅 ('말걸기' 서브메뉴 → 성향대화/일상대화(Live) 또는 안부묻기)
  const [isTalkMenuVisible, setTalkMenuVisible] = useState(false);
  const [isRenameVisible, setRenameVisible] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [activeDialogueScreen, setActiveDialogueScreen] = useState<'personality' | 'checkin' | 'live' | null>(null);

  // Setup Screen state
  const [setupBirthDate, setSetupBirthDate] = useState('1990-01-01');
  const [setupBirthTime, setSetupBirthTime] = useState('12:00');
  const [setupGender, setSetupGender] = useState<'남'|'여'>('남');

  useEffect(() => {
    // 앱 시작 시 상태 동기화 및 오프라인 시간 역산 적용
    syncOfflineTime();
    
    // 일일 운세 락킹 로직
    const today = new Date().toISOString().split('T')[0];
    if (!dailyFortuneLock || dailyFortuneLock.date !== today) {
      if (userProfile) {
        const calculatedTier = generateTodayBaseTier(userProfile);
        setDailyFortuneLock({ date: today, baseTier: calculatedTier, isRescued: false });
      }
    }
    
    if (isOverlayActive) {
      OverlayModuleSafe.startOverlay();
    } else {
      OverlayModuleSafe.stopOverlay();
    }
  }, [isOverlayActive, dailyFortuneLock]);

  useEffect(() => {
    // 오버레이 롱프레스 메뉴("말걸기"/"상태보기")를 통해 앱이 열렸다면, 해당 화면으로 바로 진입.
    const checkOverlayRoute = () => {
      OverlayModuleSafe.getInitialRoute().then((route) => {
        if (route === 'talk') {
          setTalkMenuVisible(true);
        } else if (route === 'status') {
          // "상태보기"는 메인 화면이 목적지이므로, 이미 열려있던 대화/안부묻기 화면이 있다면 닫는다.
          setTalkMenuVisible(false);
          setActiveDialogueScreen(null);
        }
      });
    };

    checkOverlayRoute(); // 콜드 스타트로 앱이 열린 경우

    // MainActivity가 singleTask라 오버레이 메뉴로 이미 떠 있는 앱을 다시 열면(onNewIntent)
    // 컴포넌트가 재마운트되지 않아 위 최초 체크만으로는 새 라우트를 못 잡는다.
    // 포그라운드로 돌아올 때마다 다시 확인해서 이 문제를 보완한다.
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkOverlayRoute();
      }
    });

    return () => subscription.remove();
  }, []);

  const currentMBTI = calculateMBTI(usePetStore.getState());
  const finalFortuneTier = calculateFortuneTier(usePetStore.getState(), dailyFortuneLock ? dailyFortuneLock.baseTier : 3);
  const fortuneText = getMockFortuneText(finalFortuneTier, '甲', '子');

  const toggleOverlay = async (value: boolean) => {
    if (value) {
      const hasPermission = await OverlayModuleSafe.requestOverlayPermission();
      if (!hasPermission) {
        Alert.alert('권한 필요', '오버레이 권한을 허용해주세요.');
        return;
      }
      setOverlayActive(true);
      OverlayModuleSafe.startOverlay();
    } else {
      setOverlayActive(false);
      OverlayModuleSafe.stopOverlay();
    }
  };

  const openLeaderboard = async () => {
    try {
      await syncToServer();
      const data = await fetchRankings();
      setLeaderboardData(data.rankings || []);
      setLeaderboardVisible(true);
    } catch (e) {
      Alert.alert('오류', '서버 통신에 실패했습니다.');
    }
  };

  const changePetName = () => {
    setRenameInput(petName);
    setRenameVisible(true);
  };

  const handleSavePetName = () => {
    const { isValidName } = require('./src/utils/nameFilter');
    if (!isValidName(renameInput)) {
      Alert.alert('경고', '이름에 사용할 수 없는 단어가 포함되어 있습니다.');
      return;
    }
    setPetName(renameInput.trim());
    setRenameVisible(false);
  };

  const openTalkMenu = () => setTalkMenuVisible(true);

  const handleSelectPersonality = () => {
    setTalkMenuVisible(false);
    setActiveDialogueScreen(petStage === 'adult' ? 'live' : 'personality');
  };

  const handleSelectCheckIn = () => {
    setTalkMenuVisible(false);
    setActiveDialogueScreen('checkin');
  };

  const closeDialogueScreen = () => setActiveDialogueScreen(null);

  const handleSaveProfile = async () => {
    if (!setupBirthDate || !setupBirthTime) {
      Alert.alert('알림', '생년월일과 태어난 시간을 모두 입력해주세요.');
      return;
    }
    
    try {
      const uuidStr = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const { registerGuest, updateProfile } = require('./src/utils/apiClient');
      
      const { access_token } = await registerGuest(uuidStr);
      useUserStore.getState().setAuthToken(access_token);
      
      const year = parseInt(setupBirthDate.split('-')[0], 10);
      const currentYear = new Date().getFullYear();
      const age = currentYear - year;
      const age_group = `${Math.floor(age / 10) * 10}s`;
      
      await updateProfile(access_token, {
        age_group,
        gender: setupGender,
      });

      setUserProfile({
        birthDate: setupBirthDate,
        birthTime: setupBirthTime,
        gender: setupGender
      });
    } catch (e) {
      console.error('[App] handleSaveProfile error:', e);
      Alert.alert('오류', '네트워크 연결을 확인해주세요.');
    }
  };

  if (!userProfile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.setupCard}>
          <Text style={styles.title}>내 사주 정보 입력</Text>
          <Text style={{marginBottom: 20, textAlign: 'center'}}>정확한 맞춤 운세를 위해 태어난 정보를 입력해주세요.</Text>
          
          <Text style={styles.label}>생년월일 (YYYY-MM-DD)</Text>
          <TextInput 
            style={styles.input} 
            value={setupBirthDate} 
            onChangeText={setSetupBirthDate}
            placeholder="1990-01-01" 
          />

          <Text style={styles.label}>태어난 시간 (HH:mm)</Text>
          <TextInput 
            style={styles.input} 
            value={setupBirthTime} 
            onChangeText={setSetupBirthTime}
            placeholder="12:00" 
          />

          <Text style={styles.label}>성별</Text>
          <View style={{flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20}}>
            <Button title="남성" color={setupGender === '남' ? '#4CAF50' : '#ccc'} onPress={() => setSetupGender('남')} />
            <Button title="여성" color={setupGender === '여' ? '#4CAF50' : '#ccc'} onPress={() => setSetupGender('여')} />
          </View>

          <Button title="시작하기" onPress={handleSaveProfile} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>LuckyYum (In-App)</Text>
        <View style={styles.headerButtons}>
          <Button title="✏️" onPress={changePetName} />
          <Button title="🏆" onPress={openLeaderboard} />

          <Button title="📖" onPress={() => setMemorialVisible(true)} />
        </View>
      </View>

      <PetRenderer />

      {activeQuestText && (
        <View style={styles.questBanner}>
          <Text style={styles.questText}>💬 {activeQuestText}</Text>
        </View>
      )}

      <View style={styles.statsCard}>
        <Text style={styles.statText}>🍖 Fullness: {physical_fullness}/100</Text>
        <Text style={styles.statText}>💖 Intimacy: {spirit_intimacy}/100</Text>
        <Text style={styles.statText}>✨ Cleanliness: {physical_cleanliness}/100</Text>
        <Text style={styles.statText}>⚖️ Weight: {physical_weight}/100</Text>
        <Text style={styles.statText}>😊 Happiness: {spirit_happiness}/100</Text>
        {env_poopCount > 0 && <Text style={styles.statText}>💩 응가: {env_poopCount}개</Text>}
        <Text style={styles.statText}>{physical_health === 'sick' ? '🤒 건강: 아픔' : '💪 건강: 양호'}</Text>
        <Text style={styles.mbtiText}>🧠 MBTI: {currentMBTI}</Text>
      </View>

      <View style={styles.fortuneCard}>
        <Text style={styles.fortuneTitle}>오늘의 운세 (등급: {finalFortuneTier})</Text>
        <Text style={styles.fortuneDesc}>{fortuneText}</Text>
      </View>

      {!isDead ? (
        <View>
          {petStage === 'egg' && (
            <View style={{ marginBottom: 15 }}>
              <Button title="✨ 새 알 뽑기 (가챠) ✨" onPress={gachaEgg} color="#FFD700" />
            </View>
          )}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionButton} onPress={feed}>
              <Text style={styles.actionText}>{petStage === 'egg' ? '부화시키기 🥚' : '밥주기 🍚'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={play}>
              <Text style={styles.actionText}>놀아주기 ⚽</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={clean}>
              <Text style={styles.actionText}>청소하기 🧹</Text>
            </TouchableOpacity>
          </View>
          {petStage !== 'egg' && (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionButton} onPress={openTalkMenu}>
                <Text style={styles.actionText}>대화하기 💬</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={pet}>
                <Text style={styles.actionText}>쓰다듬기 🤗</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={bathe}>
                <Text style={styles.actionText}>목욕시키기 🛁</Text>
              </TouchableOpacity>
            </View>
          )}
          {petStage !== 'egg' && (
            <View style={styles.actionRow}>
              {physical_health === 'sick' && (
                <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#E53935' }]} onPress={giveMedicine}>
                  <Text style={styles.actionText}>약주기 💊 ({physical_medicineDoses}/2)</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#00897B' }]} onPress={vaccinate}>
                <Text style={styles.actionText}>예방접종 💉</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <Button title="새 펫 뽑기 (환생)" onPress={hatchEgg} color="#ff5c5c" />
      )}

      <View style={{ marginVertical: 20 }}>
        <Button title="[Dev] 6시간 뒤로 감기 (Time Travel)" onPress={() => timeTravelForward(6)} />
      </View>

      <View style={styles.switchContainer}>
        <Text style={styles.label}>Android Overlay {isOverlayActive ? 'ON' : 'OFF'}</Text>
        <Switch
          value={isOverlayActive}
          onValueChange={toggleOverlay}
        />
      </View>

      <Modal visible={isLeaderboardVisible} animationType="slide" onRequestClose={() => setLeaderboardVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <Text style={styles.title}>글로벌 랭킹 보드</Text>
          <FlatList
            data={leaderboardData}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item, index }) => (
              <View style={styles.modalListItem}>
                <Text>{index + 1}위. {item.pet_nickname} ({item.pet_mbti}) - {item.care_score}점</Text>
              </View>
            )}
          />
          <Button title="닫기" onPress={() => setLeaderboardVisible(false)} />
        </SafeAreaView>
      </Modal>

      <Modal visible={isMemorialVisible} animationType="slide" onRequestClose={() => setMemorialVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <Text style={styles.title}>명예의 전당 (Memorial)</Text>
          <FlatList
            data={memorials}
            keyExtractor={(item, index) => index.toString()}
            renderItem={({ item, index }) => (
              <View style={styles.modalListItem}>
                <Text>👻 {item.name} ({item.mbti}) - {item.score}점</Text>
                <Text style={{ fontSize: 12, color: 'gray' }}>{new Date(item.diedAt).toLocaleDateString()}</Text>
              </View>
            )}
          />
          <Button title="닫기" onPress={() => setMemorialVisible(false)} />
        </SafeAreaView>
      </Modal>

      <Modal visible={isRenameVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.renameCard}>
            <Text style={styles.title}>펫 이름 변경</Text>
            <TextInput
              style={styles.renameInput}
              value={renameInput}
              onChangeText={setRenameInput}
              placeholder="새 이름을 입력하세요"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 }}>
              <Button title="취소" color="#888" onPress={() => setRenameVisible(false)} />
              <Button title="저장" onPress={handleSavePetName} />
            </View>
          </View>
        </View>
      </Modal>

      <TalkMenuScreen
        visible={isTalkMenuVisible}
        onClose={() => setTalkMenuVisible(false)}
        onSelectPersonality={handleSelectPersonality}
        onSelectCheckIn={handleSelectCheckIn}
      />
      <PetDialogue visible={activeDialogueScreen === 'personality'} onClose={closeDialogueScreen} />
      <CheckInScreen visible={activeDialogueScreen === 'checkin'} onClose={closeDialogueScreen} />
      <LiveTalkScreen visible={activeDialogueScreen === 'live'} onClose={closeDialogueScreen} />

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5FCFF',
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  questBanner: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FFB74D',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 15,
  },
  questText: {
    fontSize: 14,
    color: '#E65100',
    fontWeight: 'bold',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  statsCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  statText: {
    fontSize: 16,
    marginBottom: 5,
    color: '#444',
    fontWeight: 'bold',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    padding: 15,
    marginHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  mbtiText: {
    fontSize: 16,
    marginTop: 10,
    color: '#8A2BE2',
    fontWeight: '900',
  },
  fortuneCard: {
    backgroundColor: '#FFFACD',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  fortuneTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D2691E',
    marginBottom: 5,
  },
  fortuneDesc: {
    fontSize: 14,
    color: '#555',
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    elevation: 3,
  },
  
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center'
  },
  renameCard: {
    width: '80%', backgroundColor: '#fff', borderRadius: 15, padding: 20, elevation: 5
  },
  renameInput: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginVertical: 15
  },

  modalContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  modalListItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 10,
  },
  setupCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 15,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    fontSize: 16,
  }
});

export default App;
