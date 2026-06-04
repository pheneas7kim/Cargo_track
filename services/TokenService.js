// services/TokenService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import serverUrl from '../config';

let tokenRefreshListeners = [];

export const addTokenRefreshListener = (listener) => {
  tokenRefreshListeners.push(listener);
  console.log("Token refresh listener added, total listeners:", tokenRefreshListeners.length);

  // Return unsubscribe function
  return () => {
    tokenRefreshListeners = tokenRefreshListeners.filter(l => l !== listener);
    console.log("Token refresh listener removed");
  };
};

const notifyTokenRefresh = (newToken) => {
  console.log("Notifying", tokenRefreshListeners.length, "listeners about token refresh");
  tokenRefreshListeners.forEach(listener => {
    try {
      listener(newToken);
    } catch (error) {
      console.error("Error in token refresh listener:", error);
    }
  });
};

export const refreshAccessToken = async () => {
  console.log("🔄 Refreshing access token...");

  try {
    const refreshToken = await AsyncStorage.getItem('refreshToken');
    console.log("Refresh token found:", refreshToken ? "Yes" : "No");

    if (!refreshToken) {
      console.log("❌ No refresh token found");
      return null;
    }

    // Call your backend refresh endpoint
    const response = await axios.post(`${serverUrl}auth/refresh-token`, {
      refreshToken: refreshToken
    });

    console.log("Refresh response status:", response.status);

    if (response.status === 200 && response.data) {
      let newAccessToken = null;

      // Handle different response formats
      if (typeof response.data === 'string') {
        // If response is just the token string
        newAccessToken = response.data;
      } else if (response.data.accessToken) {
        newAccessToken = response.data.accessToken;
      } else if (response.data.token) {
        newAccessToken = response.data.token;
      } else if (response.data.data && response.data.data.accessToken) {
        newAccessToken = response.data.data.accessToken;
      }

      if (newAccessToken) {
        // Save the new token
        await AsyncStorage.setItem('accessToken', newAccessToken);
        console.log("✅ Token refreshed and saved successfully");

        // If a new refresh token is provided, save it too
        if (response.data.refreshToken) {
          await AsyncStorage.setItem('refreshToken', response.data.refreshToken);
        }

        // Notify all listeners
        notifyTokenRefresh(newAccessToken);

        return newAccessToken;
      } else {
        console.log("❌ No access token in response:", Object.keys(response.data));
        return null;
      }
    } else {
      console.log("❌ Token refresh failed - invalid response status");
      return null;
    }
  } catch (error) {
    console.error("❌ Token refresh error:", error.message);

    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);

      // If refresh token is invalid, clear it
      if (error.response.status === 401 || error.response.status === 403) {
        console.log("Refresh token invalid, clearing tokens...");
        await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
      }
    }

    return null;
  }
};

// Optional: Function to check if token is expired
export const isTokenExpired = async () => {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    if (!token) return true;

    // Decode JWT token to check expiration
    const payload = token.split('.')[1];
    if (!payload) return true;

    const decoded = JSON.parse(atob(payload));
    const currentTime = Date.now() / 1000;

    return decoded.exp < currentTime;
  } catch (error) {
    console.error("Error checking token expiration:", error);
    return true;
  }
};

// Optional: Function to get current token
export const getAccessToken = async () => {
  try {
    return await AsyncStorage.getItem('accessToken');
  } catch (error) {
    console.error("Error getting access token:", error);
    return null;
  }
};

// Optional: Function to clear all tokens (on logout)
export const clearTokens = async () => {
  try {
    await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
    console.log("All tokens cleared");
    return true;
  } catch (error) {
    console.error("Error clearing tokens:", error);
    return false;
  }
};