import React, { useEffect, useState } from 'react';
import { SafeAreaView, View, TouchableOpacity, Image, PermissionsAndroid, Platform } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack'; // Import createStackNavigator
import Onboarding from './screens/onboarding'; // Import the Onboarding screen
import Dashboard from './screens/Dashboard'; // Import the Dashboard screen
import Login from './screens/Login'; // Import the Login screen
import ProfilePage from './screens/ProfilePage'; // Import the Profile screen
import MyWithdrawals from './screens/Withdrawals'; // Import the Onboarding screen
import MyTips from './screens/Transactions'; // Import the Onboarding screen
import SetSecretPin from './screens/EnterPin'; // Import the Onboarding screen
import SetNewSecretPin from './screens/setnewpin'; // Import the Onboarding screen
import RegisterPage from './screens/register'; // Import the Onboarding screen
import SplashScreen from './screens/SplashScreen'; // Import the Onboarding screen
import ForgotPassword from './screens/forgotpassword'; // Import the Login screen
import QrPaymentScanner from './screens/QrPaymentScanner'; // Import the Onboarding screen
import MpesaPaybillQRCode from './screens/qrcodepage'; // Import the Onboarding screen
import GeofencesScreen from './screens/GeofencesScreen'; // Import the Onboarding screen
import MasterSlaveMapper from './screens/MasterSlaveMapper';
import NotificationsScreen from './screens/NotificationsScreen'; // Import the Onboarding screen
import AlarmsNotigicationScreen from './screens/AlarmsNotigicationScreen'; // Import the Onboarding screen
import TicketsScreen from './screens/TicketsScreen'; // Import the Onboarding screen
import DevicesScreen from './screens/DevicesScreen'; // Import the Onboarding screen
import DeviceMapScreen from './screens/DeviceMapScreen'; // Import the Onboarding screen
import HotspotsScreen from './screens/HotspotsScreen'; // Import the Onboarding screen
import StationsScreen from './screens/StationsScreen'; // Import the Onboarding screen
import  DeviceMapScreenView from './screens/DeviceMapScreenView'; // Import the Onboarding screen
import CommandsScreen from './screens/CommandsScreen'; // Import the Onboarding screen
import TrackOnMap from './screens/TrackOnMap'; // Import the Onboarding screen
import TrackOnMap2 from './screens/TrackOnMap2';
import AlertsNotigicationScreen from './screens/AlertsNotigicationScreen'; // Import the Onboarding screen
import store from './Store';
import { Provider } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage'; // <-- add this import
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import CreateTicket from './screens/CreateTicket';
import AttatchEvidence from './screens/AttatchEvidence';
import messaging from '@react-native-firebase/messaging';
import RandomStopScreen from './screens/RandomStopScreen';
import RequestEsealsScreen from './screens/RequestEsealsScreen';
import AssignedEseals from './screens/AssignedEseals';
import { setupAxiosLogging } from './utils/axiosLogger';
import notifee, { AndroidImportance } from '@notifee/react-native';

// Define the types for your stack
type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Dashboard: undefined;
  Profile: undefined;
  Withdraw: undefined;
  Transactions: undefined;
  SecretPin: undefined;
  NewSecretPin: undefined;
  Register:undefined;
  SplashScreen: undefined;
  ForgotPassword: undefined;
  MpesaPaybillQRCode: undefined;
  ScanAndPayScreen: undefined;
  QrPaymentScanner: undefined;
  MasterSlaveMapper: undefined;
  NotificationsScreen: undefined;
  AlarmsNotigicationScreen: undefined;
  TicketsScreen: undefined;
  DevicesScreen: undefined;
  DeviceMapScreen: undefined;
  HotspotsScreen: undefined;
  StationsScreen: undefined;
  GeofencesScreen: undefined;
  DeviceMapScreenView: undefined;
  CommandsScreen: undefined;
  TrackOnMap: undefined;
  TrackOnMap2: undefined;
  AlertsNotigicationScreen: undefined;
  RandomStopScreen: undefined;
  RequestEsealsScreen: undefined;
  AssignedEseals: undefined;
  CreateTicket: undefined;
  AttatchEvidence: undefined;
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
// Create a Stack Navigator
const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    setupAxiosLogging();

    // Notification Logic (Permissions, Channels, Handlers)
    const setupNotifications = async () => {
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      await notifee.createChannel({
        id: 'default',
        name: 'Default Channel',
        importance: AndroidImportance.HIGH,
      });
    };
    setupNotifications();

    messaging().getToken().then(token => console.log("DEVICE_TOKEN:", token));

    // 1. Your existing User Name logic
    const getUserName = async () => {
      const name = await AsyncStorage.getItem('name');
      if (name) setUserName(name);
    };
    getUserName();

    // Foreground listener
    const unsubscribeForeground = messaging().onMessage(async remoteMessage => {
      await notifee.displayNotification({
        title: remoteMessage.notification?.title,
        body: remoteMessage.notification?.body,
        android: {
          channelId: 'default',
          pressAction: { id: 'default' },
        },
      });
    });

    const unsubscribeOpened = messaging().onNotificationOpenedApp(remoteMessage => {
      if (remoteMessage.data?.ticketId) {
        if (navigationRef.isReady()) {
          navigationRef.navigate('TicketsScreen', { ticketId: remoteMessage.data.ticketId } as any);
        }
      }
    });

    messaging().getInitialNotification().then(remoteMessage => {
      if (remoteMessage?.data?.ticketId) {
        setTimeout(() => {
          if (navigationRef.isReady()) {
            navigationRef.navigate('TicketsScreen', { ticketId: remoteMessage.data.ticketId } as any);
          }
        }, 1000);
      }
    });

    return () => {
      unsubscribeForeground();
      unsubscribeOpened();
    };
  }, []);

  return (
    <Provider store={store}>
      <NavigationContainer ref={navigationRef}>
        <SafeAreaView style={{ flex: 1 }}>
          <Stack.Navigator initialRouteName="SplashScreen">
            {/* Onboarding screen */}
            <Stack.Screen name="SplashScreen" component={SplashScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Onboarding" component={Onboarding} options={{ headerShown: false }} />

            {/* Login screen */}
            <Stack.Screen name="Login" component={Login} options={{ headerShown: false }} />
            <Stack.Screen name="ForgotPassword" component={ForgotPassword} options={{ headerShown: false }} />


            <Stack.Screen name="Register" component={RegisterPage} options={{ headerShown: false }} />
            <Stack.Screen name="Dashboard" component={Dashboard} options={{ headerShown: false }} />
            <Stack.Screen name="NotificationsScreen" component={NotificationsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AlarmsNotigicationScreen" component={AlarmsNotigicationScreen} options={{ headerShown: false }} />
              <Stack.Screen name="TicketsScreen" component={TicketsScreen} options={{ headerShown: false }} />
              <Stack.Screen name="DevicesScreen" component={DevicesScreen} options={{ headerShown: false }} />
              <Stack.Screen name="DeviceMapScreen" component={DeviceMapScreen} options={{ headerShown: false }} />
              <Stack.Screen name="HotspotsScreen" component={HotspotsScreen} options={{ headerShown: false }} />
              <Stack.Screen name="StationsScreen" component={StationsScreen} options={{ headerShown: false }} />
              <Stack.Screen name="GeofencesScreen" component={GeofencesScreen} options={{ headerShown: false }} />
              <Stack.Screen name="DeviceMapScreenView" component={DeviceMapScreenView} options={{ headerShown: false }} />
              <Stack.Screen name="CommandsScreen" component={CommandsScreen} options={{ headerShown: false }} />
              <Stack.Screen name="TrackOnMap" component={TrackOnMap} options={{ headerShown: false }} />
              <Stack.Screen name="TrackOnMap2" component={TrackOnMap2} options={{ headerShown: false }} />
              <Stack.Screen name="AlertsNotigicationScreen" component={AlertsNotigicationScreen} options={{ headerShown: false }} />
              <Stack.Screen name="RandomStopScreen" component={RandomStopScreen} options={{ headerShown: false }} />
              <Stack.Screen name="RequestEsealsScreen" component={RequestEsealsScreen} options={{ headerShown: false }} />
              <Stack.Screen name="AssignedEseals" component={AssignedEseals} options={{ headerShown: false }} />


            <Stack.Screen
              name="Withdraw"
              component={MyWithdrawals}
              options={{
                title:  'My Withdrawals',
                headerTitleStyle: {
                  fontSize: 16,
                  fontWeight: '600',
                },
                headerRight: () => <ProfileIcon />,
              }}
            />

            <Stack.Screen
              name="SecretPin"
              component={SetSecretPin}
              options={{
                title: 'Enter PIN',
                headerTitleStyle: {
                  fontSize: 16,
                  fontWeight: '600',
                },
                headerRight: () => <ProfileIcon />,
              }}
            />

            <Stack.Screen
              name="MpesaPaybillQRCode"
              component={MpesaPaybillQRCode}
              options={{
                title: 'Scan QR Code',
                headerTitleStyle: {
                  fontSize: 16,
                  fontWeight: '600',
                },
                headerRight: () => <ProfileIcon />,
              }}
            />

            { <Stack.Screen
              name="QrPaymentScanner"
              component={QrPaymentScanner}
              options={{
                title: 'Scan To Pay',
                headerTitleStyle: {
                  fontSize: 16,
                  fontWeight: '600',
                },
              }}
            /> }

            <Stack.Screen
              name ="MasterSlaveMapper"
              component = {MasterSlaveMapper}
              options={{
                  title: 'Map Sensors',
                  headerTitleStyle:{
                      fontSize: 16,
                      fontWeight: '600',
                      },
                  }}/>


            <Stack.Screen
              name="NewSecretPin"
              component={SetNewSecretPin}
              options={{
                title: 'Set Secret PIN',
                headerTitleStyle: {
                  fontSize: 16,
                  fontWeight: '600',
                },
                headerRight: () => <ProfileIcon />,
              }}
            />

            <Stack.Screen
              name="Transactions"
              component={MyTips}
              options={{
                title:  'My Tips',
                headerTitleStyle: {
                  fontSize: 16,
                  fontWeight: '600',
                },
                headerRight: () => <ProfileIcon />,
              }}
            />

            {/* Profile screen */}
            <Stack.Screen name="Profile" component={ProfilePage} />
            <Stack.Screen name="CreateTicket" component={CreateTicket} />
            <Stack.Screen name="AttatchEvidence" component={AttatchEvidence} />

          </Stack.Navigator>
        </SafeAreaView>
      </NavigationContainer>
    </Provider>
  );
}

const ProfileIcon = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={{ flexDirection: 'row', marginRight: 16, alignItems: 'center' }}>

      <TouchableOpacity onPress={() => navigation.navigate('MpesaPaybillQRCode')}>
        <Image source={require('./assets/qr.png')} style={{ width: 26, height: 26 }} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.navigate('Profile')}
        style={{ marginLeft: 12 }} // Adjust spacing as needed
      >
        <Image source={require('./assets/user.png')} style={{ width: 26, height: 26 }} />
      </TouchableOpacity>

    </View>
  );
};