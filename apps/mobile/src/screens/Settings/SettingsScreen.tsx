import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import auth from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useAuthStore } from '../../store/authStore';
import { checkForUpdate, CURRENT_BUILD_NUMBER, CURRENT_VERSION, DRIVE_APK_ID } from '../../services/updateService';

// APKファイルのDrive直リンク（Driveアプリ or ブラウザで開く）
const DRIVE_APK_URL = `https://drive.google.com/file/d/${DRIVE_APK_ID}/view`;

export default function SettingsScreen() {
  const { user } = useAuthStore();
  const [checking, setChecking] = useState(false);

  const handleCheckUpdate = async () => {
    if (Platform.OS !== 'android') return;
    setChecking(true);
    try {
      await checkForUpdate(true);
    } finally {
      setChecking(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('ログアウト', 'ログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ログアウト',
        style: 'destructive',
        onPress: async () => {
          await GoogleSignin.signOut();
          await auth().signOut();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>⚙️ 設定</Text>

        {/* ユーザー情報 */}
        <View style={styles.userCard}>
          {user?.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>{user?.displayName?.[0] ?? '?'}</Text>
            </View>
          )}
          <View>
            <Text style={styles.userName}>{user?.displayName ?? 'ゲスト'}</Text>
            <Text style={styles.userEmail}>{user?.email ?? ''}</Text>
          </View>
        </View>

        {/* アプリ情報 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>アプリ情報</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>バージョン</Text>
            <Text style={styles.infoValue}>v{CURRENT_VERSION} (build {CURRENT_BUILD_NUMBER})</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>プラットフォーム</Text>
            <Text style={styles.infoValue}>Android</Text>
          </View>
        </View>

        {/* アップデート確認 */}
        {Platform.OS === 'android' && (
          <>
            <TouchableOpacity
              style={[styles.updateBtn, checking && styles.updateBtnDisabled]}
              onPress={handleCheckUpdate}
              disabled={checking}
            >
              {checking ? (
                <ActivityIndicator size="small" color="#3b82f6" />
              ) : (
                <Text style={styles.updateBtnText}>🔄 アップデートを確認</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.driveBtn}
              onPress={() => Linking.openURL(DRIVE_APK_URL)}
            >
              <Text style={styles.driveBtnText}>📂 Driveを開いて手動インストール</Text>
              <Text style={styles.driveBtnSub}>Driveアプリまたはブラウザで最新APKを開きます</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ログアウト */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>ログアウト</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },
  content: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 24 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 24, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#374151', fontSize: 22, fontWeight: 'bold' },
  userName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  userEmail: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  section: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 16, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#9ca3af', marginBottom: 12, textTransform: 'uppercase' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoLabel: { color: '#374151', fontSize: 14 },
  infoValue: { color: '#6b7280', fontSize: 14 },
  updateBtn: { backgroundColor: '#ffffff', borderRadius: 10, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#3b82f6', marginBottom: 10 },
  updateBtnDisabled: { opacity: 0.6 },
  updateBtnText: { color: '#3b82f6', fontWeight: '600', fontSize: 15 },
  driveBtn: { backgroundColor: '#f0fdf4', borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#86efac', marginBottom: 12 },
  driveBtnText: { color: '#16a34a', fontWeight: '600', fontSize: 14 },
  driveBtnSub: { color: '#6b7280', fontSize: 11, marginTop: 3 },
  signOutBtn: { marginTop: 'auto', backgroundColor: '#ffffff', borderRadius: 10, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#ef4444' },
  signOutText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
});
