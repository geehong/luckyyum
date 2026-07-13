import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { usePetStore } from '../store/petStore';

const getSpeciesName = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  const speciesIndex = Math.abs(hash) % 3;
  if (speciesIndex === 0) return 'fly';
  if (speciesIndex === 1) return 'dragon';
  return 'bear';
};

// android/app/src/main/res/drawable의 pet_{species}_01..NN.png(egg는 pet_egg_{species}_01..NN.png)
// 프레임 시퀀스 + 각 species의 *_anim.xml에 박제된 프레임 지속시간(ms)과 동일한 값.
const IDLE_ANIM_CONFIG: Record<string, { frames: number; durationMs: number }> = {
  bear: { frames: 12, durationMs: 150 },
  dragon: { frames: 12, durationMs: 150 },
  fly: { frames: 12, durationMs: 150 },
  egg_bear: { frames: 16, durationMs: 300 },
  egg_dragon: { frames: 12, durationMs: 300 },
  egg_fly: { frames: 16, durationMs: 300 },
};
const pad2 = (n: number) => String(n).padStart(2, '0');

const PetRenderer = () => {
  const { petStage, isDead, petName, petBirthDate, physical_species, physical_health, env_poopCount } = usePetStore();

  // 3번 섹션(Option A): teen→adult 전환 시 확정된 physical_species가 있으면 그걸 쓰고,
  // 그 전(egg/baby/junior/teen)에는 지금처럼 이름 해시로 정해지는 임시 종을 보여준다.
  const species = physical_species ?? getSpeciesName(petName);
  const isAnimated = !isDead && petStage !== 'memorial';
  const animKey = petStage === 'egg' ? `egg_${species}` : species;

  const [frame, setFrame] = useState(0);

  useEffect(() => {
    setFrame(0);
    if (!isAnimated) return;
    const config = IDLE_ANIM_CONFIG[animKey];
    if (!config) return;

    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % config.frames;
      setFrame(i);
    }, config.durationMs);
    return () => clearInterval(id);
  }, [animKey, isAnimated]);

  const renderPetImage = () => {
    if (!isAnimated) {
      return <Text style={styles.petText}>👻</Text>;
    }

    const drawableName = petStage === 'egg'
      ? `pet_egg_${species}_${pad2(frame + 1)}`
      : `pet_${species}_${pad2(frame + 1)}`;

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

  return (
    <View style={styles.container}>
      <View>
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
  }
});

export default PetRenderer;
