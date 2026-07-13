import React, { useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import EmptyButton from '../assets/svg/EmptyButton.svg';
import EmptyButtonPressed from '../assets/svg/EmptyButtonPressed.svg';

interface ActionButtonProps {
  emoji: string;
  onPress: () => void;
}

export const ActionButton: React.FC<ActionButtonProps> = ({ emoji, onPress }) => {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      onPress={onPress}
      style={styles.container}
    >
      <View style={styles.svgContainer}>
        {isPressed ? (
          <EmptyButtonPressed width={60} height={60} />
        ) : (
          <EmptyButton width={60} height={60} />
        )}
      </View>
      <View style={styles.contentContainer}>
        <Text style={styles.emojiText}>{emoji}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 10,
  },
  svgContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  contentContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  emojiText: {
    fontSize: 24,
  },
});
