import { StyleSheet, Text, View } from 'react-native';

import { APP_NAME } from '@/constants/app';

/** Temporary foundation route (CP01). Replaced by Splash screen in CP10. */
export default function Index() {
  return (
    <View style={styles.root}>
      <Text accessibilityRole="header">{APP_NAME}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
