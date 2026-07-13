import React, { useRef } from 'react';
import { TouchableOpacity, Animated, StyleSheet, useWindowDimensions } from 'react-native';

interface ActionButtonProps {
  Icon: React.FC<any>;
  onPress: () => void;
}

export const ActionButton: React.FC<ActionButtonProps> = ({ Icon, onPress }) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const { width } = useWindowDimensions();
  // Calculate size dynamically: screen width - padding (40) - some gap (30), divided by 4
  const buttonSize = Math.floor((width - 40 - 30) / 4); 

  const handlePressIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={[styles.container, { width: buttonSize, height: buttonSize }]}
    >
      <Animated.View style={[styles.svgContainer, { transform: [{ scale: scaleValue }] }]}>
        <Icon width={buttonSize} height={buttonSize} />
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  svgContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
