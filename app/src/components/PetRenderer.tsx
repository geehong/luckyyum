import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useUserStore } from '../store/userStore';

const PetRenderer = () => {
  const { petStage, isDead } = useUserStore();

  const getPetEmoji = () => {
    if (isDead || petStage === 'memorial') return '👻'; // 유령/묘비
    switch (petStage) {
      case 'egg': return '🥚';
      case 'baby': return '🐣';
      case 'teen': return '🐥';
      case 'adult': return '🦅';
      default: return '❓';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.petText}>{getPetEmoji()}</Text>
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
  stageText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  }
});

export default PetRenderer;
