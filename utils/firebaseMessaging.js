import messaging from '@react-native-firebase/messaging';
import axios from 'axios';
import serverURL from '../config';
import DeviceInfo from 'react-native-device-info';

export const requestPermissionAndToken = async (userId, accessTokenFromLogin) => {
  try {
    console.log('================================');
    console.log('FCM FLOW STARTED for user:', userId);

    const authStatus = await messaging().requestPermission();

    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    console.log('Permission enabled?', enabled);

    if (!enabled) {
      console.log('FCM permission not granted. Exiting flow.');
      return;
    }

    const fcmToken = await messaging().getToken();
    console.log('FCM TOKEN GENERATED:', fcmToken);

    const deviceName = await DeviceInfo.getDeviceName();
    const appVersion = DeviceInfo.getVersion();

    const accessToken = accessTokenFromLogin;

    console.log('==============================');
    console.log('ACCESS TOKEN RECEIVED FROM LOGIN:', accessToken);
    console.log('==============================');

    if (!accessToken) {
      console.log('MISSING ACCESS TOKEN - STOPPING REQUEST');
      return;
    }

    const payload = {
      fcmToken,
      deviceName,
      platform: 'ANDROID',
      appVersion,
    };

    console.log('================================');
    console.log('DEVICE REGISTER PAYLOAD (PRE REQUEST):');
    console.log(JSON.stringify(payload, null, 2));
    console.log('REQUEST URL:', `${serverURL}user-devices/register`);
    console.log('REQUEST HEADERS:', {
      Authorization: 'Bearer ***PRESENT***',
      'Content-Type': 'application/json',
    });
    console.log('================================');

    const response = await axios.post(
      `${serverURL}user-devices/register`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('==============================');
    console.log('REQUEST SENT SUCCESSFULLY');
    console.log('STATUS:', response.status);
    console.log('DATA:', response.data);
    console.log('==============================');

  } catch (error) {
    console.log('================================');
    console.log('FCM ERROR START');

    if (error?.response) {
      console.log('STATUS:', error.response.status);
      console.log('DATA:', error.response.data);
      console.log('HEADERS:', error.response.headers);
    } else if (error?.request) {
      console.log('NO RESPONSE RECEIVED');
      console.log(error.request);
    } else {
      console.log('ERROR MESSAGE:', error.message);
    }

    console.log('FULL ERROR OBJECT:', error);
    console.log('FCM ERROR END');
    console.log('================================');
  }
};

export const setupNotificationListeners = () => {
  messaging().onMessage(async remoteMessage => {
    console.log('Foreground notification:', remoteMessage);
  });

  messaging().onNotificationOpenedApp(remoteMessage => {
    console.log('Opened from background:', remoteMessage);
  });

  messaging()
    .getInitialNotification()
    .then(remoteMessage => {
      if (remoteMessage) {
        console.log('Opened from quit:', remoteMessage);
      }
    });
};
