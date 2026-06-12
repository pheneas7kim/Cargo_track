import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ImageBackground,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import Swiper from 'react-native-swiper';
import setNavigationColor from 'react-native-navigation-bar-color';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from './UI/type';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ========== OFFLINE MODULE IMPORTS ==========
import OfflineDatabaseService from '../services/OfflineDatabaseService';
import NetworkMonitorService from '../services/NetworkMonitorService';
// ========== END OFFLINE MODULE IMPORTS ==========

const slides = [
    {
    image: require('../assets/pg3.png'),
    text: 'Welcome to Tips',
    subtitle: 'Send and receive tips seamlessly. Enjoy a simple and fast way to manage your earnings and contributions.'
  },
  {
    image: require('../assets/imp2.jpg'),
    text: 'Manage Your Wallet',
    subtitle: 'Track your balance, view transaction history, and stay on top of your funds with an intuitive wallet interface.'

  },
  {
    image: require('../assets/imp.jpg'),
    text: 'Withdraw Anytime',
    subtitle: 'Withdraw your tips anytime, anywhere. We support secure and fast withdrawals to your preferred payment method.'

  },
];

const OnboardingScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [currentIndex, setCurrentIndex] = useState(0);

  // ========== OFFLINE MODE STATE VARIABLES ==========
  const [isOnline, setIsOnline] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  // ========== END OFFLINE MODE STATE VARIABLES ==========

  useEffect(() => {
    if (Platform.OS === 'android') {
      setNavigationColor('transparent', false, true);
    }
  }, []);

  // ========== OFFLINE MODE INITIALIZATION ==========
  useEffect(() => {
    const initOfflineMode = async () => {
      try {
        // Initialize offline database
        await OfflineDatabaseService.initDatabase();
        console.log('✅ Offline database initialized for Onboarding Screen');

        // Initialize network monitor
        NetworkMonitorService.init();

        // Listen for network changes
        NetworkMonitorService.on('connectionChange', (online) => {
          setIsOnline(online);
          if (!online) {
            console.log('📴 Offline mode in Onboarding');
          }
        });

        // Check if user has already seen onboarding
        const onboardingCompleted = await AsyncStorage.getItem('onboardingCompleted');
        if (onboardingCompleted === 'true') {
          setHasSeenOnboarding(true);
          // Auto-navigate to Login if onboarding already seen
          navigation.replace('Login');
        }
      } catch (error) {
        console.error('❌ Offline mode init error:', error);
      }
    };

    initOfflineMode();

    return () => {
      // Cleanup
      NetworkMonitorService.cleanup();
    };
  }, []);
  // ========== END OFFLINE MODE INITIALIZATION ==========

  // ========== OFFLINE: Mark onboarding as completed ==========
  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem('onboardingCompleted', 'true');
      console.log('✅ Onboarding marked as completed');
    } catch (error) {
      console.error('Error saving onboarding status:', error);
    }
  };
  // ========== END OFFLINE MARK COMPLETED ==========

  const handleGetStarted = async () => {
    // Mark onboarding as completed
    await completeOnboarding();

    // Navigate to Login screen
    navigation.replace('Login');
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ========== OFFLINE: Network status indicator ========== */}
      {!isOnline && (
        <View style={styles.offlineIndicator}>
          <Text style={styles.offlineIndicatorText}>📴 Offline Mode</Text>
        </View>
      )}
      {/* ========== END OFFLINE INDICATOR ========== */}

      {/* Swiper with logo and dynamic subtitle */}
      <Swiper
        loop={false}

        onIndexChanged={(index) => setCurrentIndex(index)}
        dotColor="rgba(255,255,255,0.5)"
        activeDotColor="#fff"
        paginationStyle={styles.pagination}
      >
        {slides.map((slide, index) => (
        <ImageBackground
          key={index}
          source={slide.image}
          style={styles.background}
          resizeMode="cover"
        >
          <View style={styles.overlay}>
            <View style={styles.logoContainer}>
              <Image source={require('../assets/logos.png')} style={styles.logo} />
            </View>

               <View style={styles.subtitleContainer}>
                <Text style={styles.title}>{slide.text}</Text>
                <Text style={styles.subtitle}>{slide.subtitle}</Text>
              </View>
        </View>
      </ImageBackground>
        ))}
      </Swiper>

      {/* Static Sign In Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={handleGetStarted}>
          <Text style={styles.buttonText}>Get Started</Text>

        </TouchableOpacity>
      </View>
    </View>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  logo: {
    height: 100,
    resizeMode: 'contain',
    top: 30
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: Platform.OS === 'android' ? 60 : 80,  // your existing margin top for logo
  },
  subtitleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    paddingHorizontal: 10,
    fontWeight: 400,
    fontFamily: 'Helvetica',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    textAlign: 'center',
    paddingHorizontal: 10,
    fontWeight: 'bold',
    fontFamily: 'Helvetica',
  },
  pagination: {
    bottom: 160,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#edb705',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
    width: '80%',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '400',
  },
  icon: {
    marginLeft: 10,
    color: '#fff',
  },
  // ========== OFFLINE STYLES ==========
  offlineIndicator: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 40,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    zIndex: 10,
  },
  offlineIndicatorText: {
    color: '#FF9800',
    fontSize: 12,
    fontWeight: '500',
  },
  // ========== END OFFLINE STYLES ==========
});

export default OnboardingScreen;