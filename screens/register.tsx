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
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import serverUrl from '../config';
import Snackbar from 'react-native-snackbar';
import * as Animatable from 'react-native-animatable';

const { width, height } = Dimensions.get('window');

const extractMessage = (body: any): string => {
  try {
    if (body && typeof body === 'object') {
      return body.data || body.message || JSON.stringify(body);
    }
    return body;
  } catch {
    return 'An error occurred';
  }
};

const RegisterPage = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNo, setPhoneNo] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Focus states for better UX
  const [emailFocused, setEmailFocused] = useState(false);
  const [firstNameFocused, setFirstNameFocused] = useState(false);
  const [lastNameFocused, setLastNameFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleLoginPress = () => {
    navigation.navigate('Login');
  };

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isValidPhone = (phone: string) => {
    const phoneRegex = /^\+254[0-9]{9}$/;
    return phoneRegex.test(phone);
  };

  const handleRegistration = async () => {
    // Enhanced validation
    if (!email.trim()) {
      Snackbar.show({
        text: 'Email is required',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    if (!isValidEmail(email)) {
      Snackbar.show({
        text: 'Please enter a valid email address',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    if (!firstName.trim()) {
      Snackbar.show({
        text: 'First Name is required',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    if (!lastName.trim()) {
      Snackbar.show({
        text: 'Last Name is required',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    if (!phoneNo.trim()) {
      Snackbar.show({
        text: 'Phone Number is required',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    if (!isValidPhone(phoneNo)) {
      Snackbar.show({
        text: 'Please enter a valid Kenyan phone number',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    if (!password.trim()) {
      Snackbar.show({
        text: 'Password is required',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    if (password.length < 6) {
      Snackbar.show({
        text: 'Password must be at least 6 characters',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${serverUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: firstName,
          lastName: lastName,
          otherNames: lastName,
          userEmail: email,
          phoneNo: phoneNo,
          city: 'Nairobi',
          postalAddress: '20400',
          streetName: 'Nairobi',
          userName: email,
          password: password,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        Snackbar.show({
          text: 'Account created successfully! Please login.',
          duration: 3000,
          backgroundColor: '#4ECDC4',
        });

        setTimeout(() => {
          setLoading(false);
          navigation.replace('Login');
        }, 2000);
      } else {
        const errorData = await response.json();
        const message = extractMessage(errorData);

        Snackbar.show({
          text: message,
          duration: 3000,
          backgroundColor: '#FF6B6B',
        });
        setLoading(false);
      }
    } catch (error) {
      Snackbar.show({
        text: 'Something went wrong. Please try again later.',
        duration: 3000,
        backgroundColor: '#FF6B6B',
      });
      setLoading(false);
    }
  };

  const formatPhoneNumber = (text: string) => {
    // Remove all non-numeric characters
    const cleaned = text.replace(/[^0-9]/g, '');
    
    // If it starts with 254, add the +
    if (cleaned.startsWith('254')) {
      return `+${cleaned}`;
    }
    
    // If it starts with 0, replace with +254
    if (cleaned.startsWith('0')) {
      return `+254${cleaned.substring(1)}`;
    }
    
    // If it's just digits, assume it's after 254
    if (cleaned.length > 0) {
      return `+254${cleaned}`;
    }
    
    return text;
  };

  const isFormValid = email && firstName && lastName && phoneNo && password;

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
          duration={1000}
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
          
          <Text style={styles.welcomeText}>Create Account</Text>
          <Text style={styles.subtitle}>Join Golden Tie Tipping today</Text>
        </Animatable.View>

        {/* Form Section */}
        <Animatable.View 
          animation="fadeInUp" 
          duration={1000}
          delay={300}
          style={styles.formSection}
        >
          {/* Email Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={[
              styles.inputWrapper, 
              emailFocused && styles.inputWrapperFocused,
              email && styles.inputWrapperFilled
            ]}>
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor="#A0A0A0"
                keyboardType="email-address"
                value={email}
                autoCapitalize="none"
                onChangeText={setEmail}
              />
            </View>
          </View>

          {/* Name Row */}
          <View style={styles.nameRow}>
            <View style={[styles.inputContainer, styles.nameInput]}>
              <Text style={styles.inputLabel}>First Name</Text>
              <View style={[
                styles.inputWrapper, 
                firstNameFocused && styles.inputWrapperFocused,
                firstName && styles.inputWrapperFilled
              ]}>
                <TextInput
                  style={styles.input}
                  placeholder="First name"
                  placeholderTextColor="#A0A0A0"
                  value={firstName}
                  autoCapitalize="words"
                  onChangeText={setFirstName}
                />
              </View>
            </View>

            <View style={[styles.inputContainer, styles.nameInput]}>
              <Text style={styles.inputLabel}>Last Name</Text>
              <View style={[
                styles.inputWrapper, 
                lastNameFocused && styles.inputWrapperFocused,
                lastName && styles.inputWrapperFilled
              ]}>
                <TextInput
                  style={styles.input}
                  placeholder="Last name"
                  placeholderTextColor="#A0A0A0"
                  value={lastName}
                  autoCapitalize="words"
                  onChangeText={setLastName}
                />
              </View>
            </View>
          </View>

          {/* Phone Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Phone Number</Text>
            <View style={[
              styles.inputWrapper, 
              phoneFocused && styles.inputWrapperFocused,
              phoneNo && styles.inputWrapperFilled
            ]}>
              <TextInput
                style={styles.input}
                placeholder="+254712345678"
                placeholderTextColor="#A0A0A0"
                keyboardType="phone-pad"
                value={phoneNo}
                maxLength={13}
                onChangeText={(text) => setPhoneNo(formatPhoneNumber(text))}
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={[
              styles.inputWrapper, 
              passwordFocused && styles.inputWrapperFocused,
              password && styles.inputWrapperFilled
            ]}>
              <TextInput
                style={[styles.input, { paddingRight: 50 }]}
                placeholder="Create a password"
                placeholderTextColor="#A0A0A0"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
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
          </View>

          {/* Register Button */}
          <TouchableOpacity 
            style={[
              styles.registerButton, 
              loading && styles.registerButtonDisabled,
              isFormValid && styles.registerButtonActive
            ]} 
            onPress={handleRegistration}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.loadingText}>Creating account...</Text>
              </View>
            ) : (
              <Text style={styles.registerButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          {/* Login Link */}
          <View style={styles.loginContainer}>
            <Text style={styles.loginPrompt}>Already have an account? </Text>
            <TouchableOpacity onPress={handleLoginPress} activeOpacity={0.7}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
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
    // shadowOffset: {
    //   width: 0,
    //   height: 4,
    // },
    // shadowOpacity: 0.1,
    // shadowRadius: 8,
    // elevation: 5,
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
    // transition: 'all 0.2s ease',
  },
  inputWrapperFocused: {
    borderColor: '#FFD700',
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFD700',
    // shadowOffset: {
    //   width: 0,
    //   height: 0,
    // },
    // shadowOpacity: 0.2,
    // shadowRadius: 8,
    // elevation: 3,
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
    // shadowColor: '#000',
    // shadowOffset: {
    //   width: 0,
    //   height: 2,
    // },
    // shadowOpacity: 0.1,
    // shadowRadius: 4,
    // elevation: 3,
  },
  registerButtonActive: {
    backgroundColor: '#FFD700',
    shadowColor: '#FFD700',
    // shadowOpacity: 0.3,
  },
  registerButtonDisabled: {
    backgroundColor: '#CCCCCC',
    shadowOpacity: 0,
    elevation: 0,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
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
});

export default RegisterPage;