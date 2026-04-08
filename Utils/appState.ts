import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
export const STORAGE_KEYS = {
  ONBOARDING_COMPLETED: '@onboarding_completed',
  USER_LOGGED_IN: '@user_logged_in',
  FIRST_LAUNCH: '@first_launch',
  USER_DATA: '@user_data',
} as const;

// Onboarding functions
export const completeOnboarding = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETED, 'true');
  } catch (error) {
    console.error('Error completing onboarding:', error);
    throw error;
  }
};

export const isOnboardingCompleted = async (): Promise<boolean> => {
  try {
    const completed = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETED);
    return completed === 'true';
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    return false;
  }
};

// Login functions
export const setUserLoggedIn = async (userData?: any): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_LOGGED_IN, 'true');
    if (userData) {
      await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
    }
  } catch (error) {
    console.error('Error setting user login status:', error);
    throw error;
  }
};

export const setUserLoggedOut = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER_LOGGED_IN,
      STORAGE_KEYS.USER_DATA,
    ]);
  } catch (error) {
    console.error('Error logging out user:', error);
    throw error;
  }
};

export const isUserLoggedIn = async (): Promise<boolean> => {
  try {
    const loggedIn = await AsyncStorage.getItem(STORAGE_KEYS.USER_LOGGED_IN);
    return loggedIn === 'true';
  } catch (error) {
    console.error('Error checking login status:', error);
    return false;
  }
};

// Reset app state (useful for testing or logout)
export const resetAppState = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.ONBOARDING_COMPLETED,
      STORAGE_KEYS.USER_LOGGED_IN,
      STORAGE_KEYS.USER_DATA,
    ]);
  } catch (error) {
    console.error('Error resetting app state:', error);
    throw error;
  }
};