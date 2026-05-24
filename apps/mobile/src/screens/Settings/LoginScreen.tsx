import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';

// Web クライアント ID（Firebase Console > Authentication > Google > ウェブ クライアント ID）
const WEB_CLIENT_ID = '723877374529-0leqjaor6b4218127sdul1jp9929gbvj.apps.googleusercontent.com';

GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await GoogleSignin.hasPlayServices();
      const { data } = await GoogleSignin.signIn();
      if (!data?.idToken) throw new Error('idToken が取得できませんでした');
      const credential = auth.GoogleAuthProvider.credential(data.idToken);
      await auth().signInWithCredential(credential);
    } catch (e: any) {
      if (e.code !== 'SIGN_IN_CANCELLED') {
        Alert.alert('ログインエラー', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconArea}>
        <Text style={styles.icon}>📚</Text>
        <Text style={styles.appName}>学習トラッカー</Text>
        <Text style={styles.subtitle}>学習を記録して、確実に身につける</Text>
      </View>

      <TouchableOpacity
        style={[styles.googleBtn, loading && styles.btnDisabled]}
        onPress={handleGoogleSignIn}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.googleBtnText}>Google でログイン</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconArea: { alignItems: 'center', marginBottom: 64 },
  icon: { fontSize: 72, marginBottom: 16 },
  appName: { fontSize: 28, fontWeight: 'bold', color: '#f9fafb', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4285F4',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    gap: 12,
    width: '100%',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  googleIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    backgroundColor: '#fff',
    color: '#4285F4',
    width: 24,
    height: 24,
    textAlign: 'center',
    borderRadius: 2,
    lineHeight: 24,
  },
  googleBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
