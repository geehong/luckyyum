import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { usePetStore } from '../store/petStore';

// 각 애니메이션 상태별 프레임 수 정의 (전부 duration 150ms로 통일)
const ANIM_CONFIG: Record<string, number> = {
  idle: 12,
  eat: 9,
  play: 9,
  sleep: 3,
  happy: 9,
  walk: 9,
  bathe: 9,
  sick: 9,
  dirty: 9,
  vaccinate: 9,
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const getSpeciesName = (name: string, lockedSpecies?: string | null): string => {
  if (lockedSpecies) return lockedSpecies;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % 3;
  if (idx === 0) return 'fly';
  if (idx === 1) return 'dragon';
  return 'bear';
};

const PetRenderer = () => {
  const { 
    petStage, isDead, petName, petBirthDate, physical_health, 
    physical_cleanliness, env_poopCount, 
    visual_activeAction, visual_chatMessage, setVisualState,
    physical_species
  } = usePetStore();

  // 이름 기반 해시 또는 확정된 종을 사용하여 실제 종 결정
  const species = getSpeciesName(petName || 'Unknown', physical_species);
  const isAnimated = !isDead && petStage !== 'memorial';

  const [frame, setFrame] = useState(0);

  // 현재 재생해야 할 애니메이션 상태 결정
  let currentAnimState = 'idle';
  if (visual_activeAction) {
    currentAnimState = visual_activeAction;
  } else if (physical_health === 'sick') {
    currentAnimState = 'sick';
  } else if (physical_cleanliness < 30) {
    currentAnimState = 'dirty';
  }

  // 달걀 단계일 때는 16프레임
  const framesCount = petStage === 'egg' ? 16 : (ANIM_CONFIG[currentAnimState] || 12);

  // 프레임 재생
  useEffect(() => {
    setFrame(0);
    if (!isAnimated) return;

    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % framesCount;
      setFrame(i);
    }, 150);
    return () => clearInterval(id);
  }, [currentAnimState, framesCount, isAnimated]);

  // 액션 타이머 (3초 후 자동 해제)
  useEffect(() => {
    if (visual_activeAction || visual_chatMessage) {
      const timer = setTimeout(() => {
        setVisualState(null, null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [visual_activeAction, visual_chatMessage, setVisualState]);

  const renderPetImage = () => {
    if (!isAnimated) {
      return <Text style={styles.petText}>👻</Text>;
    }

    let drawableName = '';
    if (petStage === 'egg') {
      drawableName = `pet_egg_${species}_${pad2(frame + 1)}`;
    } else {
      if (currentAnimState === 'idle') {
        drawableName = `pet_${species}_${pad2(frame + 1)}`;
      } else {
        drawableName = `pet_${species}_${currentAnimState}_${pad2(frame + 1)}`;
      }
    }

    return (
      <Image
        source={{ uri: drawableName }}
        style={styles.petImage}
        resizeMode="contain"
      />
    );
  };

  let ageStr = '';
  if (petStage !== 'egg' && !isDead && petBirthDate) {
    const daysElapsed = Math.floor((Date.now() - petBirthDate) / (1000 * 60 * 60 * 24));
    ageStr = `(D+${daysElapsed}일)`;
  }

  // 패시브 상태일 때 기본 대사 출력 (액션 대사가 없을 때만)
  let displayMessage = visual_chatMessage;
  if (!displayMessage && !visual_activeAction) {
    if (physical_health === 'sick') displayMessage = "콜록콜록 아파요...";
    else if (physical_cleanliness < 30) displayMessage = "너무 더러워요 ㅠㅠ";
  }

  return (
    <View style={styles.container}>
      <View>
        {displayMessage && (
          <View style={styles.chatBubble}>
            <Text style={styles.chatText}>{displayMessage}</Text>
          </View>
        )}
        {renderPetImage()}
        {!isDead && physical_health === 'sick' && <Text style={styles.overlayIcon}>😷</Text>}
        {!isDead && env_poopCount > 0 && (
          <Text style={styles.poopBadge}>{'💩'.repeat(Math.min(env_poopCount, 3))}</Text>
        )}
      </View>
      <Text style={styles.stageText}>
        {isDead ? '별이 되었습니다...' : `Stage: ${petStage.toUpperCase()} ${ageStr}`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'transparent',
    width: 250,
  },
  petText: {
    fontSize: 80,
  },
  petImage: {
    width: 150,
    height: 150,
  },
  overlayIcon: {
    position: 'absolute',
    top: 0,
    right: 0,
    fontSize: 30,
  },
  poopBadge: {
    position: 'absolute',
    bottom: -10,
    left: -10,
    fontSize: 24,
  },
  stageText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  chatBubble: {
    position: 'absolute',
    top: -30,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#eee',
    zIndex: 10,
    elevation: 3,
  },
  chatText: {
    fontSize: 14,
    color: '#333',
    fontWeight: 'bold',
  },
});

export default PetRenderer;
