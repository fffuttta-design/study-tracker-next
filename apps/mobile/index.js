/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';

// 裏で通知を受けたときの受け口。
// 表示自体は notification ペイロードでOSがやるので、ここでやることは無い。
// ⚠ ただし登録しておかないと、data 付きの通知が裏で届いたとき
//    「No task registered for key ReactNativeFirebaseMessagingHeadlessTask」で落ちる。
messaging().setBackgroundMessageHandler(async () => {});

AppRegistry.registerComponent(appName, () => App);
