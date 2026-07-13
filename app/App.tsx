import React, { useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View, Switch, Button, Alert, TouchableOpacity, Modal, FlatList, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import StatusScreen from './src/components/StatusScreen';
import { ActionButton } from './src/components/ActionButton';
import HeartFullSvg from './src/assets/svg/heart_full.svg';
import HeartHalfSvg from './src/assets/svg/heart_half.svg';
import HeartEmptySvg from './src/assets/svg/heart_empty.svg';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import FortuneBannerSvg from './android/app/src/main/res/drawable/layout_svg/운세 쳇창-1.svg';
import QuestBannerSvg from './android/app/src/main/res/drawable/layout_svg/펫상태 쳇창-1.svg';
import BtnClean from './src/assets/svg/btn_clean.svg';
import BtnStatus from './src/assets/svg/btn_status.svg';
import BtnTalk from './src/assets/svg/btn_talk.svg';
import BtnPet from './src/assets/svg/btn_pet.svg';
import BtnFeed from './src/assets/svg/btn_feed.svg';
import BtnBathe from './src/assets/svg/btn_bathe.svg';
import BtnPlay from './src/assets/svg/btn_play.svg';
import BtnMedicine from './src/assets/svg/btn_medicine.svg';
import { syncOfflineTime, timeTravelForward } from './src/utils/timeSync';
import { calculateMBTI } from './src/utils/mbtiCalculator';
import { calculateFortuneTier, getMockFortuneText, generateTodayBaseTier } from './src/utils/fortuneLogic';
import { fetchRankings } from './src/utils/apiClient';
import petQuestsData from './src/data/petQuests.json';
import { MEAL_SLOTS, MEDICINE_DOSES_REQUIRED } from './src/config/gameBalance';

// 1. Run migration before app initializes
migrateOldStorage();

const App = () => {
  const { userProfile, setUserProfile, authToken, isOverlayActive, setOverlayActive } = useUserStore();
  const {
    petName, setPetName, setDailyFortuneLock,
    physical_fullness, spirit_intimacy, physical_cleanliness, physical_weight,
    physical_health, physical_medicineDoses, spirit_happiness, spirit_activeQuest,
    env_poopCount, spirit_mealGacha, petBirthDate,
    physical_evolutionGrade, physical_species, physical_vaccinatedUntil,
    spirit_playCount, spirit_mbtiScores, spirit_finalizedMbti,
    isDead, petStage, feed, openMealGacha, chooseMealAmount, play, clean, bathe, pet, giveMedicine, vaccinate,
    dailyFortuneLock,
    gachaEgg, memorials, syncToServer
  } = usePetStore();

  const activeQuest = spirit_activeQuest
    ? petQuestsData.find((q) => q.id === spirit_activeQuest.questId) ?? null
    : null;

  // 11번: 청소/목욕/예방접종/놀아주기/쓰다듬기는 상시 버튼이 아니라 이 퀘스트 배너를 탭해서 해결한다.
  const questActionMap: Record<string, () => void> = {
    feed: openMealGacha, play, pet, bathe, clean, vaccinate,
  };
  const handleResolveQuest = () => {
    if (!activeQuest) return;
    questActionMap[activeQuest.resolveAction]?.();
  };

  // 11번: 밥주기는 시간대 슬롯(아침/점심/저녁) 안에서만, 끼니당 1번만 가능 — 별도 쿨다운 없이 슬롯 자체가 상한.
  const handleBathePress = () => {
    if (petStage === 'egg') {
      if (!petName) {
        Alert.alert('알림', '펫 이름을 먼저 정해주세요!');
        setRenameVisible(true);
        return;
      }
      feed(); // 이 함수가 알을 부화시키는 로직임
      Alert.alert('알림', '따뜻하게 품어주었더니 알이 부화했습니다!');
      return;
    }
    bathe();
  };

  const handleFeedPress = () => {
    if (petStage === 'egg') {
      // 밥주기는 알 상태에서 불가능
      Alert.alert('알림', '아직 알 상태라서 밥을 먹을 수 없어요.');
      return;
    }
    openMealGacha();
    if (!usePetStore.getState().spirit_mealGacha) {
      Alert.alert(
        '지금은 밥 줄 시간이 아니에요',
        '아침(05~11시) · 점심(11~17시) · 저녁(17~23시)에 다시 시도해주세요. 이미 이번 끼니를 줬을 수도 있어요.',
      );
    }
  };

  const [isLeaderboardVisible, setLeaderboardVisible] = useState(false);
  const [isMemorialVisible, setMemorialVisible] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [isStatsModalVisible, setStatsModalVisible] = useState(false);

  // M3 대화 & 안부 묻기 화면 라우팅 ('말걸기' 서브메뉴 → 성향대화/일상대화(Live) 또는 안부묻기)
  const [isTalkMenuVisible, setTalkMenuVisible] = useState(false);
  const [isRenameVisible, setRenameVisible] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editBirthTime, setEditBirthTime] = useState('');
  const [editGender, setEditGender] = useState<'남' | '여'>('남');
  const [editPhone, setEditPhone] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [editSettingsPetName, setEditSettingsPetName] = useState('');
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

  const openSettings = () => {
    setEditBirthDate(userProfile?.birthDate ?? '');
    setEditBirthTime(userProfile?.birthTime ?? '');
    setEditGender(userProfile?.gender ?? '남');
    setEditPhone(userProfile?.phone ?? '');
    setEditRegion(userProfile?.region ?? '');
    setEditSettingsPetName(petName);
    setSettingsVisible(true);
  };

  const handleSaveSettings = async () => {
    if (!editBirthDate || !editBirthTime || !editSettingsPetName) {
      Alert.alert('알림', '필수 정보를 입력해주세요.');
      return;
    }
    const { isValidName } = require('./src/utils/nameFilter');
    if (!isValidName(editSettingsPetName)) {
      Alert.alert('경고', '이름에 사용할 수 없는 단어가 포함되어 있습니다.');
      return;
    }

    setUserProfile({
      ...userProfile,
      birthDate: editBirthDate,
      birthTime: editBirthTime,
      gender: editGender,
      phone: editPhone,
      region: editRegion,
    });
    setPetName(editSettingsPetName.trim());

    if (authToken) {
      try {
        const { updateProfile } = require('./src/utils/apiClient');
        const year = parseInt(editBirthDate.split('-')[0], 10);
        const currentYear = new Date().getFullYear();
        const age_group = `${Math.floor((currentYear - year) / 10) * 10}s`;
        await updateProfile(authToken, { age_group, gender: editGender });
      } catch (e) {
        console.error('[App] handleSaveSettings error:', e);
      }
    }

    Alert.alert('알림', '설정이 저장되었습니다!');
    setSettingsVisible(false);
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
    <SafeAreaView style={styles.screenContainer}>
      <View style={[StyleSheet.absoluteFill, { zIndex: -1 }]}>
        <Svg height="100%" width="100%">
          <Defs>
            <LinearGradient id="mainBg" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0" stopColor="#C2ACFF" />
              <Stop offset="1" stopColor="#B6E0F5" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#mainBg)" />
        </Svg>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>LuckyYum (In-App)</Text>
        <View style={styles.headerButtons}>
          <Button title="✏️" onPress={changePetName} />
          <Button title="🏆" onPress={openLeaderboard} />
          <Button title="📖" onPress={() => setMemorialVisible(true)} />
          <Button title="⚙️" onPress={openSettings} />
        </View>
      </View>

      {/* 배너 영역: 운세와 퀘스트가 동시에 노출 가능하도록 구현 */}
      <View style={styles.bannerContainer}>
        {/* 운세 배너 */}
        <View style={styles.fortuneBannerWrapper}>
          <View style={styles.fortuneBannerContent}>
            <Text style={styles.fortuneBannerTitle}>✨ 오늘의 운세 (등급: {finalFortuneTier})</Text>
            <Text style={styles.fortuneBannerDesc}>{fortuneText}</Text>
          </View>
        </View>

        {/* 퀘스트 배너 */}
        {activeQuest && (
          <TouchableOpacity style={styles.questBannerWrapper} onPress={handleResolveQuest}>
            <View style={styles.questBannerContent}>
              <Text style={styles.questText}>💬 {activeQuest.text}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* 펫 영역 (카드 제거, 투명화) */}
      <View style={{ alignItems: 'center', marginVertical: 20 }}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => setStatsModalVisible(true)}>
          <PetRenderer />
        </TouchableOpacity>
        <View style={{ marginTop: 15, width: 232, height: 41, backgroundColor: '#EEECFF', borderRadius: 17.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderTopColor: '#d6d3f0', borderLeftColor: '#d6d3f0', borderBottomColor: '#ffffff', borderRightColor: '#ffffff' }}>
          {Array.from({ length: 5 }).map((_, i) => {
            const count = Math.max(0, Math.min(5, Math.floor(spirit_intimacy / 20)));
            const decimal = (spirit_intimacy % 20) / 20;
            if (i < count) return <HeartFullSvg key={i} width={36} height={28} />;
            if (i === count && decimal >= 0.5) return <HeartHalfSvg key={i} width={36} height={28} />;
            return <HeartEmptySvg key={i} width={36} height={28} />;
          })}
        </View>
      </View>


      {/* 4x2 버튼 그리드 */}
      {!isDead ? (
        <View style={styles.actionGridContainer}>
          {petStage === 'egg' && (
            <TouchableOpacity style={styles.gachaButton} onPress={gachaEgg}>
              <Text style={styles.gachaButtonText}>✨ 새 알 뽑기 (가챠) ✨</Text>
            </TouchableOpacity>
          )}
          <View style={styles.actionGridRow}>
            <ActionButton Icon={BtnFeed} onPress={() => { console.log("[Button] 포크(먹이주기) 눌림"); handleFeedPress(); }} />
            <ActionButton Icon={BtnBathe} onPress={() => { console.log("[Button] 반달(부화시키기) 눌림"); handleBathePress(); }} />
            <ActionButton Icon={BtnPlay} onPress={() => { console.log("[Button] 게임기(놀아주기) 눌림"); play(); }} />
            <ActionButton Icon={BtnClean} onPress={() => { console.log("[Button] 빗자루(청소하기) 눌림"); clean(); }} />
          </View>
          <View style={styles.actionGridRow}>
            <ActionButton Icon={BtnMedicine} onPress={() => { console.log("[Button] 약통(건강검진) 눌림"); physical_health === 'sick' ? giveMedicine() : vaccinate(); }} />
            <ActionButton Icon={BtnTalk} onPress={() => { console.log("[Button] 사람2명(채팅) 눌림"); openTalkMenu(); }} />
            <ActionButton Icon={BtnStatus} onPress={() => { console.log("[Button] 학사모(MBTI) 눌림"); setStatsModalVisible(true); }} />
            <ActionButton Icon={BtnPet} onPress={() => { console.log("[Button] 체중계(생각중) 눌림"); pet(); }} />
          </View>
        </View>
      ) : (
        <Button title="새 펫 뽑기 (환생)" onPress={gachaEgg} color="#ff5c5c" />
      )}

      {/* 상세 스탯 모달 */}
      <StatusScreen 
        visible={isStatsModalVisible} 
        onClose={() => setStatsModalVisible(false)} 
        userProfile={userProfile} 
        dailyFortuneLock={dailyFortuneLock} 
      />

      <Modal visible={!!spirit_mealGacha} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.renameCard}>
            <Text style={styles.title}>🍚 얼마나 줄까요?</Text>
            <Text style={styles.gachaSubtitle}>
              {spirit_mealGacha && MEAL_SLOTS.find((s) => s.id === spirit_mealGacha.slotId)?.label} 식사량을 골라주세요
            </Text>
            <View style={styles.gachaChoiceRow}>
              {spirit_mealGacha?.choices.map((amount, idx) => (
                <TouchableOpacity key={idx} style={styles.gachaChoiceButton} onPress={() => chooseMealAmount(amount)}>
                  <Text style={styles.gachaChoiceText}>{amount}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

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
      </ScrollView>

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

      <Modal visible={isSettingsVisible} animationType="slide" onRequestClose={() => setSettingsVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.title}>설정 / 정보 확인</Text>

            <Text style={styles.settingsSectionTitle}>👤 유저 정보 설정</Text>
            <Text style={styles.label}>생년월일</Text>
            <TextInput style={styles.input} value={editBirthDate} onChangeText={setEditBirthDate} placeholder="1990-01-01" />
            <Text style={styles.label}>태어난 시간</Text>
            <TextInput style={styles.input} value={editBirthTime} onChangeText={setEditBirthTime} placeholder="12:00" />
            <Text style={styles.label}>성별</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 }}>
              <Button title="남성" color={editGender === '남' ? '#4CAF50' : '#ccc'} onPress={() => setEditGender('남')} />
              <Button title="여성" color={editGender === '여' ? '#4CAF50' : '#ccc'} onPress={() => setEditGender('여')} />
            </View>
            <Text style={styles.label}>전화번호</Text>
            <TextInput style={styles.input} value={editPhone} onChangeText={setEditPhone} placeholder="010-0000-0000" />
            <Text style={styles.label}>주소(지역)</Text>
            <TextInput style={styles.input} value={editRegion} onChangeText={setEditRegion} placeholder="서울시 강남구" />
            <Text style={styles.label}>이름</Text>
            <TextInput style={styles.input} value={editSettingsPetName} onChangeText={setEditSettingsPetName} />

            <View style={{ height: 1, backgroundColor: '#ddd', marginVertical: 20 }} />

            <Text style={styles.settingsSectionTitle}>🐾 펫 정보 (읽기 전용)</Text>
            <Text style={styles.settingsInfoRow}>
              단계: {petStage.toUpperCase()} (나이 {petBirthDate && !isDead && petStage !== 'egg' ? Math.floor((Date.now() - petBirthDate) / 86400000) : 0}일)
            </Text>
            <Text style={styles.settingsInfoRow}>진화 등급: {physical_evolutionGrade || '아직 없음'} / 확정 종: {physical_species || '아직 없음(성체 전환 시 확정)'}</Text>
            <Text style={styles.settingsInfoRow}>포만감 (Fullness): {physical_fullness}</Text>
            <Text style={styles.settingsInfoRow}>유대감 (Intimacy): {spirit_intimacy}</Text>
            <Text style={styles.settingsInfoRow}>청결도 (Cleanliness): {physical_cleanliness}</Text>
            <Text style={styles.settingsInfoRow}>체중 (Weight): {physical_weight}</Text>
            <Text style={styles.settingsInfoRow}>행복도 (Happiness, EMA): {spirit_happiness}</Text>
            <Text style={styles.settingsInfoRow}>응가 개수: {env_poopCount}</Text>
            <Text style={styles.settingsInfoRow}>
              건강 상태: {physical_health === 'sick' ? `아픔 (약 ${physical_medicineDoses}/${MEDICINE_DOSES_REQUIRED}회 투여)` : '양호'}
            </Text>
            <Text style={styles.settingsInfoRow}>
              예방접종 유효: {physical_vaccinatedUntil && Date.now() < physical_vaccinatedUntil ? new Date(physical_vaccinatedUntil).toLocaleString() + '까지' : '없음'}
            </Text>
            <Text style={styles.settingsInfoRow}>놀이 총량(누적): {spirit_playCount}</Text>
            <Text style={styles.settingsInfoRow}>
              MBTI 점수: E:{spirit_mbtiScores.E} I:{spirit_mbtiScores.I} / S:{spirit_mbtiScores.S} N:{spirit_mbtiScores.N} / T:{spirit_mbtiScores.T} F:{spirit_mbtiScores.F} / J:{spirit_mbtiScores.J} P:{spirit_mbtiScores.P}
            </Text>
            <Text style={styles.settingsInfoRow}>확정 MBTI: {spirit_finalizedMbti || '아직 없음'}</Text>
            <Text style={styles.settingsInfoRow}>진행 중인 펫 퀘스트: {activeQuest ? activeQuest.text : '없음'}</Text>
            <Text style={styles.settingsInfoRow}>사망 여부: {isDead ? '예' : '아니오'}</Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 20 }}>
              <Button title="닫기" color="#888" onPress={() => setSettingsVisible(false)} />
              <Button title="설정 저장" onPress={handleSaveSettings} />
            </View>
          </ScrollView>
        </SafeAreaView>
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
    backgroundColor: 'transparent',
    padding: 20,
    justifyContent: 'center',
  },
  screenContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
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
  bannerContainer: {
    marginVertical: 10,
    width: '100%',
    alignItems: 'center',
  },
  fortuneBannerWrapper: {
    width: '100%',
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderRadius: 17.5,
    overflow: 'hidden',
    backgroundColor: '#EEECFF',
    borderWidth: 1,
    borderTopColor: '#d6d3f0',
    borderLeftColor: '#d6d3f0',
    borderBottomColor: '#ffffff',
    borderRightColor: '#ffffff',
  },
  questBannerWrapper: {
    width: '100%',
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 17.5,
    overflow: 'hidden',
    backgroundColor: '#EEECFF',
    borderWidth: 1,
    borderTopColor: '#d6d3f0',
    borderLeftColor: '#d6d3f0',
    borderBottomColor: '#ffffff',
    borderRightColor: '#ffffff',
  },
  questBannerContent: {
    padding: 15,
    alignItems: 'center',
  },
  fortuneBannerContent: {
    padding: 15,
    alignItems: 'center',
  },
  fortuneBannerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  fortuneBannerDesc: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
  },
  questBanner: {
    width: '100%',
    backgroundColor: 'rgba(255, 243, 224, 0.9)',
    borderColor: '#FFB74D',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  questText: {
    fontSize: 14,
    color: '#E65100',
    fontWeight: 'bold',
  },
  questHint: {
    fontSize: 12,
    color: '#FB8C00',
    marginTop: 4,
    textAlign: 'right',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  statsCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  gaugeRow: {
    marginBottom: 6,
  },
  gaugeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 2,
  },
  gaugeLabel: {
    fontSize: 12,
    color: '#444',
    fontWeight: 'bold',
  },
  gaugeTrack: {
    height: 7,
    backgroundColor: '#eee',
    borderRadius: 4,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 4,
  },
  gaugeValue: {
    fontSize: 10,
    color: '#888',
  },
  gachaSubtitle: {
    textAlign: 'center',
    marginBottom: 15,
    color: '#666',
  },
  gachaChoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  gachaChoiceButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gachaChoiceText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 20,
  },
  statText: {
    fontSize: 13,
    marginTop: 4,
    color: '#444',
    fontWeight: 'bold',
  },
  actionGridContainer: {
    paddingHorizontal: 20,
    marginTop: 10,
    width: '100%',
  },
  gachaButton: {
    backgroundColor: '#ffd700',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  gachaButtonText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 16,
  },
  actionGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  statsCardPopup: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 15,
    width: '90%',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
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
    fontSize: 13,
    marginTop: 4,
    color: '#8A2BE2',
    fontWeight: '900',
  },
  fortuneCard: {
    backgroundColor: '#FFFACD',
    padding: 12,
    borderRadius: 10,
    marginBottom: 15,
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
  },
  settingsSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  settingsInfoRow: {
    fontSize: 14,
    color: '#444',
    marginBottom: 8,
  },
});

export default App;
