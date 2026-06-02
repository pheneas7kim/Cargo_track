import React, { useState } from 'react';
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
  ScrollView,
  Dimensions
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import serverUrl from '../config'; 
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

// ✅ Helper function to get language header
const getLanguageHeader = async (i18n) => {
  try {
    const language = await AsyncStorage.getItem('userLanguage') || i18n?.language || 'en';
    return language;
  } catch (error) {
    console.error('Error getting language:', error);
    return 'en';
  }
};

const ForgotPassword = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Handle screen focus for re-entry animations
  useFocusEffect(
    React.useCallback(() => {
      setIsVisible(true);
      return () => setIsVisible(false);
    }, [])
  );

  const handleReset = async () => {
    if (!email.trim()) {
      console.warn('❌ Email is missing');
      Snackbar.show({
        text: t('forgot_password.errors.email_required', { defaultValue: 'Email is required' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setLoading(true);
    try {
      const language = await getLanguageHeader(i18n);

      console.log('📤 Sending password reset request...');
      console.log('Email:', email);
      console.log('Accept-Language:', language);

      const response = await fetch(`${serverUrl}/api/auth/forgotpassword?userEmail=${encodeURIComponent(email)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': language, // ✅ Add language header
        },
      });

      console.log('📥 Password reset response status:', response.status);

      if (response.ok) {
        let data = null;
        try {
          data = await response.json();
        } catch {
          // Handle if no JSON in response
        }

        Snackbar.show({
          text: t('forgot_password.success.password_reset', { defaultValue: 'Password reset successful!' }),
          duration: 3000,
          backgroundColor: '#4ECDC4',
        });

        setLoading(false);

        console.log('🔁 Redirecting to Login screen...');
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });

      } else {
        let errorData = {};
        try {
          errorData = await response.json();
        } catch {
          // fallback if no JSON error response
        }

        console.error('❌ Password reset failed:', errorData);

        Snackbar.show({
          text: t('forgot_password.errors.invalid_email', { defaultValue: 'Invalid Email.' }),
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });

        setLoading(false);
      }
    } catch (error) {
      console.error('🛑 Network or server error during password reset:', error);

      Snackbar.show({
        text: t('forgot_password.errors.network_error', { defaultValue: 'Something went wrong. Please try again later.' }),
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });

      setLoading(false);
    }
  };

  if (!isVisible) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header Section */}
        <Animatable.View
          animation="fadeInDown"
          duration={800}
          style={styles.headerSection}
        >
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/tiplogo.jpeg')}
              style={styles.logo}
              resizeMode="contain"
            />
            <View style={styles.logoGlow} />
          </View>

          <Text style={styles.welcomeText}>{t('forgot_password.welcome_back', { defaultValue: 'Welcome Back' })}</Text>
          <Text style={styles.subtitle}>{t('forgot_password.subtitle', { defaultValue: 'Reset your password to continue' })}</Text>
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
            <Text style={styles.inputLabel}>{t('forgot_password.labels.email', { defaultValue: 'Email Address' })}</Text>
            <View style={[
              styles.inputWrapper,
              emailFocused && styles.inputWrapperFocused,
              email && styles.inputWrapperFilled
            ]}>
              <TextInput
                style={styles.input}
                placeholder={t('forgot_password.placeholders.email', { defaultValue: 'Enter your email' })}
                placeholderTextColor="#A0A0A0"
                keyboardType="email-address"
                value={email}
                autoCapitalize="none"
                onChangeText={setEmail}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
              />
            </View>
          </Animatable.View>

          {/* Submit Button */}
          <Animatable.View animation="fadeInUp" delay={600}>
            <TouchableOpacity
              style={[
                styles.loginButton,
                loading && styles.loginButtonDisabled,
                (email) && styles.loginButtonActive
              ]}
              onPress={handleReset}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.loadingText}>{t('forgot_password.loading', { defaultValue: 'Submitting...' })}</Text>
                </View>
              ) : (
                <Text style={styles.loginButtonText}>{t('forgot_password.buttons.submit', { defaultValue: 'Submit' })}</Text>
              )}
            </TouchableOpacity>
          </Animatable.View>

        </Animatable.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 100,
    paddingBottom: 400,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    position: 'relative',
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  logoGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFD700',
    opacity: 0.1,
    zIndex: -1,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    fontWeight: '400',
  },
  formSection: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 8,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nameInput: {
    flex: 1,
    marginHorizontal: 4,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 4,
    marginLeft: 4,
  },
  inputWrapper: {
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
  },
  inputWrapperFocused: {
    borderColor: '#FFD700',
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFD700',
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
    borderColor: '#D0D0D0',
  },
  input: {
    height: 46,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1A1A1A',
    fontWeight: '400',
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 8,
    padding: 4,
  },
  eyeImage: {
    width: 20,
    height: 20,
    tintColor: '#666666',
  },
  registerButton: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
  },
  registerButtonActive: {
    backgroundColor: '#FFD700',
    shadowColor: '#FFD700',
  },
  registerButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  loginPrompt: {
    fontSize: 15,
    color: '#666666',
    fontWeight: '400',
  },
  loginLink: {
    fontSize: 15,
    color: '#FFD700',
    fontWeight: '600',
  },
  loginButton: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonActive: {
    backgroundColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOpacity: 0.3,
  },
  loginButtonDisabled: {
    backgroundColor: '#CCCCCC',
    shadowOpacity: 0,
    elevation: 0,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  forgotpasContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  registerPrompt: {
    fontSize: 15,
    color: '#666666',
    fontWeight: '400',
  },
  forgotpass: {
    fontSize: 15,
    color: '#000',
    fontWeight: '400',
  },
  registerLink: {
    fontSize: 15,
    color: '#FFD700',
    fontWeight: '600',
  },
  forgotpassLink: {
    fontSize: 15,
    color: '#000',
    fontWeight: '500',
  },
});

export default ForgotPassword;