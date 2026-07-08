import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useUserStore } from '../store/userStore';

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
  const { petStage, isDead, petName } = useUserStore();

  const renderPetImage = () => {
    if (isDead || petStage === 'memorial') {
      return <Text style={styles.petText}>👻</Text>;
    }
    
    const species = getSpeciesName(petName);
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

  return (
    <View style={styles.container}>
      {renderPetImage()}
      <Text style={styles.stageText}>
        {isDead ? '별이 되었습니다...' : `Stage: ${petStage.toUpperCase()}`}
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
  stageText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  }
});

export default PetRenderer;
