import React from 'react';
import { Modal, View } from 'react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function NowPlaying({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="slide">
      <View />
    </Modal>
  );
}
