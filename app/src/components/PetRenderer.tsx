import React from 'react';
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

const PetRenderer = () => {
  const { petStage, isDead, petName, petBirthDate, physical_species, physical_health, env_poopCount } = usePetStore();

  const renderPetImage = () => {
    if (isDead || petStage === 'memorial') {
      return <Text style={styles.petText}>👻</Text>;
    }

    // 3번 섹션(Option A): teen→adult 전환 시 확정된 physical_species가 있으면 그걸 쓰고,
    // 그 전(egg/baby/junior/teen)에는 지금처럼 이름 해시로 정해지는 임시 종을 보여준다.
    const species = physical_species ?? getSpeciesName(petName);
    let drawableName = `pet_${species}_01`;
    if (petStage === 'egg') {
      drawableName = `pet_egg_${species}_01`;
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
    backgroundColor: '#fff',
    borderRadius: 15,
    marginVertical: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  petText: {
    fontSize: 80,
  },
  petImage: {
    width: 120,
    height: 120,
  },
  overlayIcon: {
    position: 'absolute',
    top: -4,
    right: -4,
    fontSize: 24,
  },
  poopBadge: {
    position: 'absolute',
    bottom: -4,
    left: -4,
    fontSize: 16,
  },
  stageText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  }
});

export default PetRenderer;
