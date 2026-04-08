import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  Platform,
  Image,
  Text,
  Alert,
  Linking,
  Dimensions,
} from 'react-native';
import * as Animatable from 'react-native-animatable';
import setNavigationColor from 'react-native-navigation-bar-color';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from './UI/type';
import { completeOnboarding } from '../Utils/appState';
import DeviceInfo from 'react-native-device-info';
import axios from 'axios';
import { BackHandler } from 'react-native';

const { width, height } = Dimensions.get('window');
const GIST_URL =
  'https://gist.githubusercontent.com/koskcom/5c2732d1656cb33d17e8c929ec827d40/raw/app-version.json';

// Animations
const fadeInUp = {
  from: { opacity: 0, translateY: 30 },
  to: { opacity: 1, translateY: 0 },
};

const pulseScale = {
  0: { scale: 1, opacity: 0.7 },
  0.5: { scale: 1.2, opacity: 1 },
  1: { scale: 1, opacity: 0.7 },
};

const SplashScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // ✅ Navigate only if no forced update is active
  useEffect(() => {
    if (Platform.OS === 'android') {
      setNavigationColor('transparent', false, true);
    }

    const timer = setTimeout(() => {
      navigation.replace('Login');
      completeOnboarding();
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigation]);

  // ✅ Splash animation UI with cargo tracking theme
  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Background with cargo tracking color */}
      <View style={styles.background} />

      {/* Decorative Map Pattern */}
      <View style={styles.mapPattern}>
        <View style={styles.mapLine1} />
        <View style={styles.mapLine2} />
        <View style={styles.mapLine3} />
        <View style={styles.mapDot1} />
        <View style={styles.mapDot2} />
        <View style={styles.mapDot3} />
      </View>

      <View style={styles.contentContainer}>
        <Animatable.View animation="bounceIn" duration={1500} delay={300} style={styles.logoContainer}>
          <View style={styles.logoBackground}>
            <Image
              source={require('../assets/tiplogo.jpeg')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.logoGlow} />
        </Animatable.View>

        <Animatable.View
          animation={fadeInUp}
          duration={1000}
          delay={1200}
          style={styles.nameContainer}
        >
          <Text style={styles.appName}>CARGO TRACK</Text>
          <Text style={styles.tagline}>Global Logistics Solutions</Text>
          <View style={styles.divider} />
          <Text style={styles.subtitle}>Real-time Shipment Tracking</Text>
        </Animatable.View>

        <View style={styles.loadingContainer}>
          <Animatable.View
            animation={pulseScale}
            iterationCount="infinite"
            duration={1500}
            delay={2000}
            style={styles.loadingDot}
          />
          <Animatable.View
            animation={pulseScale}
            iterationCount="infinite"
            duration={1500}
            delay={2200}
            style={styles.loadingDot}
          />
          <Animatable.View
            animation={pulseScale}
            iterationCount="infinite"
            duration={1500}
            delay={2400}
            style={styles.loadingDot}
          />
        </View>

        <Animatable.View animation="fadeIn" duration={1500} delay={2500} style={styles.bottomFade}>
          <Text style={styles.versionText}>Version {DeviceInfo.getVersion()}</Text>
          <Text style={styles.copyrightText}>© 2024 Cargo Track. All rights reserved.</Text>
        </Animatable.View>
      </View>
    </View>
  );
};

// ✅ Styles with cargo tracking theme
const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#0A2B3E',
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0A2B3E',
  },
  mapPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.1,
  },
  mapLine1: {
    position: 'absolute',
    top: '15%',
    left: '10%',
    width: '80%',
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  mapLine2: {
    position: 'absolute',
    top: '35%',
    right: '15%',
    width: '60%',
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  mapLine3: {
    position: 'absolute',
    bottom: '25%',
    left: '20%',
    width: '50%',
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
    transform: [{ rotate: '-30deg' }],
  },
  mapDot1: {
    position: 'absolute',
    top: '20%',
    right: '20%',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  mapDot2: {
    position: 'absolute',
    bottom: '30%',
    left: '15%',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  mapDot3: {
    position: 'absolute',
    bottom: '45%',
    right: '25%',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  contentContainer: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    flex: 1,
    paddingHorizontal: 20,
  },
  logoContainer: { 
    position: 'relative', 
    marginBottom: 40, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  logoBackground: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  logo: { 
    width: 100, 
    height: 100, 
    borderRadius: 50,
  },
  logoGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FFA500',
    opacity: 0.2,
    zIndex: -1,
  },
  nameContainer: { 
    alignItems: 'center', 
    marginBottom: 60 
  },
  appName: { 
    fontSize: 28, 
    fontWeight: '800', 
    color: '#FFA500', 
    marginBottom: 8,
    letterSpacing: 2,
  },
  tagline: { 
    fontSize: 14, 
    fontWeight: '400', 
    color: '#E0E0E0', 
    marginBottom: 16,
    letterSpacing: 1,
  },
  divider: {
    width: 50,
    height: 2,
    backgroundColor: '#FFA500',
    marginVertical: 16,
    alignSelf: 'center',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '300',
    color: '#B0C4DE',
    letterSpacing: 0.5,
  },
  loadingContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 20 
  },
  loadingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFA500',
    marginHorizontal: 6,
    opacity: 0.7,
  },
  bottomFade: { 
    position: 'absolute', 
    bottom: 40, 
    alignItems: 'center' 
  },
  versionText: { 
    fontSize: 12, 
    color: '#B0C4DE', 
    fontWeight: '400', 
    letterSpacing: 1,
    marginBottom: 8,
  },
  copyrightText: {
    fontSize: 10,
    color: '#7F8C8D',
    fontWeight: '300',
    letterSpacing: 0.5,
  },
});

export default SplashScreen;