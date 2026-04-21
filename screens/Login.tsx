import React, { useState, useEffect, useCallback } from 'react';
import { requestPermissionAndToken, setupNotificationListeners } from '../utils/firebaseMessaging';
import {
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  StatusBar, 
  Image, 
  ActivityIndicator, 
  KeyboardAvoidingView,
  Platform,
  PermissionsAndroid,
  ScrollView,
  Alert,
  Linking,
  Dimensions,
  Animated
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import serverUrl from '../config'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import Snackbar from 'react-native-snackbar';
import { setUserLoggedIn } from '../Utils/appState';
import * as Animatable from 'react-native-animatable';

const { width, height } = Dimensions.get('window');

const Login = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  
  // Animation values
  const fadeAnim = new Animated.Value(0);
  const slideAnim = new Animated.Value(50);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Handle screen focus for re-entry animations
  useFocusEffect(
    React.useCallback(() => {
      setIsVisible(true);
      return () => setIsVisible(false);
    }, [])
  );

  /**  Request camera permission */
  useEffect(() => {
    const requestPermission = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        setHasPermission(granted === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        setHasPermission(true);
      }
    };
    requestPermission();
  }, []);

  const handleForgotPassword = () => {
    setIsVisible(false);
    setTimeout(() => {
      navigation.navigate('ForgotPassword', {
        animationTypeForReplace: 'push',
      });
    }, 150);
  };

  const handleRegisterPress = () => {
    setIsVisible(false);
    setTimeout(() => {
      navigation.navigate('Register', {
        animationTypeForReplace: 'push',
      });
    }, 150);
  };

  const handleLogin = async () => {
      if (!email.trim() || !password.trim()) {
        Snackbar.show({
          text: 'Email and Password are required',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
        return;
      }

      setLoading(true);

      const payload = {
        username: email,
        password: password,
      };

      console.log('DEBUG: Attempting login to:', `${serverUrl}auth/signin`);
      console.log('DEBUG: Request Payload:', JSON.stringify(payload));

      try {
        const response = await fetch(`${serverUrl}auth/signin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        // Log raw response status and headers
        console.log('DEBUG: Response Status:', response.status);
        console.log('DEBUG: Response Headers:', response.headers);

        const responseText = await response.text();
        console.log('DEBUG: Raw Response Text:', responseText);

        if (response.ok) {
          const data = JSON.parse(responseText);

          await AsyncStorage.setItem('accessToken', data.accessToken);
          await AsyncStorage.setItem('id', data.id.toString());
          await AsyncStorage.setItem('name', data.name);
          await AsyncStorage.setItem('email', data.email);

          setUserLoggedIn(data);

          await requestPermissionAndToken(data.id, data.accessToken);
          setupNotificationListeners();

          setLoading(false);
          navigation.reset({
            index: 0,
            routes: [{ name: 'Dashboard' }],
          });
        } else {
          console.log('DEBUG: Login failed. Server response:', responseText);
          Snackbar.show({
            text: 'Login failed. Check logs.',
            duration: 3000,
            backgroundColor: '#FF6B6B',
          });
          setLoading(false);
        }
      } catch (error) {
        console.log('DEBUG: Network or Request Error:', error);
        Snackbar.show({
          text: 'Something went wrong. Please check your connection.',
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
        setLoading(false);
      }
    };
  if (!isVisible) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0A2B3E" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0A2B3E" />
      
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Background Color */}
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

        {/* Header Section */}
        <Animatable.View 
          animation="fadeInDown" 
          duration={800}
          style={styles.headerSection}
        >
          <Animated.View 
            style={[
              styles.logoContainer,
              {
                opacity: fadeAnim,
                transform: [{ scale: fadeAnim }],
              }
            ]}
          >
            <View style={styles.logoBackground}>
              
              <Image 
                source={require('../assets/tiplogo.jpeg')} 
                style={styles.logo} 
                resizeMode="contain"
              />
            </View>
            <View style={styles.logoGlow} />
          </Animated.View>
          
          <Text style={styles.appName}>CARGO TRACK</Text>
          <Text style={styles.tagline}>Global Logistics Solutions</Text>
          <Text style={styles.welcomeText}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to track your shipments</Text>
        </Animatable.View>

        {/* Form Section */}
        <Animatable.View 
          animation="fadeInUp" 
          duration={800}
          delay={200}
          style={styles.formSection}
        >
          {/* Email Input */}
          <Animatable.View 
            animation="fadeInUp"
            delay={400}
            style={styles.inputContainer}
          >
            <Text style={styles.inputLabel}>
              <Text style={styles.labelIcon}>✉️ </Text>
              Email Address
            </Text>
            <View style={[
              styles.inputWrapper, 
              emailFocused && styles.inputWrapperFocused,
              email && styles.inputWrapperFilled
            ]}>
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor="#9AA9B3"
                keyboardType="email-address"
                value={email}
                autoCapitalize="none"
                onChangeText={setEmail}
                onBlur={() => setEmailFocused(false)}
              />
            </View>
          </Animatable.View>

          {/* Password Input */}
          <Animatable.View 
            animation="fadeInUp"
            delay={500}
            style={styles.inputContainer}
          >
            <Text style={styles.inputLabel}>
              <Text style={styles.labelIcon}>🔒 </Text>
              Password
            </Text>
            <View style={[
              styles.inputWrapper, 
              passwordFocused && styles.inputWrapperFocused,
              password && styles.inputWrapperFilled
            ]}>
              <TextInput
                style={[styles.input, { paddingRight: 50 }]}
                placeholder="Enter your password"
                placeholderTextColor="#9AA9B3"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                onBlur={() => setPasswordFocused(false)}
              />
              <TouchableOpacity 
                style={styles.eyeIcon}
                onPress={() => setShowPassword(prev => !prev)}
                activeOpacity={0.7}
              >
                <Image
                  source={
                    showPassword
                      ? require('../assets/eye.png')
                      : require('../assets/eye2.png')
                  }
                  style={styles.eyeImage}
                />
              </TouchableOpacity>
            </View>
          </Animatable.View>

          {/* Login Button */}
          <Animatable.View animation="fadeInUp" delay={600}>
            <TouchableOpacity 
              style={[
                styles.loginButton, 
                loading && styles.loginButtonDisabled,
                (email && password) && styles.loginButtonActive
              ]} 
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.loadingText}>Signing in...</Text>
                </View>
              ) : (
                <Text style={styles.loginButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </Animatable.View>

          {/* Forgot Password Link */}
          <Animatable.View 
            animation="fadeInUp" 
            delay={700}
            style={styles.forgotpasContainer}
          >
            <TouchableOpacity onPress={handleForgotPassword} activeOpacity={0.7}>
              <Text style={styles.forgotpassLink}>Forgot Password?</Text>
            </TouchableOpacity>
          </Animatable.View>

          {/* Divider
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>
          */}

          {/* Register Link
          <Animatable.View 
            animation="fadeInUp" 
            delay={800}
            style={styles.registerContainer}
          >
            <Text style={styles.registerPrompt}>Don't have an account? </Text>
            <TouchableOpacity onPress={handleRegisterPress} activeOpacity={0.7}>
              <Text style={styles.registerLink}>Create Account</Text>
            </TouchableOpacity>
          </Animatable.View> */}
        </Animatable.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 80,
    paddingBottom: 160,
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
  headerSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    position: 'relative',
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBackground: {
    width: 100,
    height: 100,
    borderRadius: 50,
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
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  logoGlow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#FFA500',
    opacity: 0.2,
    zIndex: -1,
  },
  appName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFA500',
    marginBottom: 4,
    textAlign: 'center',
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 12,
    color: '#E0E0E0',
    textAlign: 'center',
    fontWeight: '400',
    marginBottom: 20,
    letterSpacing: 1,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#B0C4DE',
    textAlign: 'center',
    fontWeight: '400',
  },
  formSection: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 8,
    marginLeft: 4,
  },
  labelIcon: {
    fontSize: 16,
  },
  inputWrapper: {
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  inputWrapperFocused: {
    borderColor: '#FFA500',
    shadowColor: '#FFA500',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  inputWrapperFilled: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFA500',
  },
  input: {
    height: 50,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#2C3E50',
    fontWeight: '400',
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 13,
    padding: 4,
  },
  eyeImage: {
    width: 20,
    height: 20,
    tintColor: '#7F8C8D',
  },
  loginButton: {
    backgroundColor: '#6B7F8C',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#FFA500',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loginButtonActive: {
    backgroundColor: '#FFA500',
    shadowOpacity: 0.4,
  },
  loginButtonDisabled: {
    backgroundColor: '#6B7F8C',
    shadowOpacity: 0,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  forgotpasContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  forgotpassLink: {
    fontSize: 14,
    color: '#FFA500',
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 12,
    color: '#7F8C8D',
    fontWeight: '500',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerPrompt: {
    fontSize: 14,
    color: '#7F8C8D',
    fontWeight: '400',
  },
  registerLink: {
    fontSize: 14,
    color: '#FFA500',
    fontWeight: '700',
  },
});

export default Login;