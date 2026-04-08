import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  Image, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView, 
  StatusBar,
  Alert,
  Dimensions,
  SafeAreaView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../screens/types';
import * as Animatable from 'react-native-animatable';

const { width } = Dimensions.get('window');

export default function ProfilePage() {
  const [userName, setUserName] = useState<string>('');
  const [emailname, setEmail] = useState<string>('');
  const [userInitials, setUserInitials] = useState<string>('');
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    const getUserData = async () => {
      try {
        const name = await AsyncStorage.getItem('name');
        const email = await AsyncStorage.getItem('email');

        if (name) {
          setUserName(name);
          // Generate initials from name
          const initials = name
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2);
          setUserInitials(initials);
        }
        if (email) {
          setEmail(email);
        }
      } catch (error) {
        console.error('Error retrieving user data:', error);
      }
    };

    getUserData();
  }, []);

  const handleNavigateSecretPage = () => {
    navigation.navigate('NewSecretPin');
  };

  const handleTopUp = () => {
    navigation.navigate('SecretPin');
  };

  const handleWithdraw = () => {
    navigation.navigate('Withdraw');
  };
  
  const handleTransactions = () => {
    navigation.navigate('Transactions');
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.clear();
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            } catch (error) {
              console.error('Error clearing AsyncStorage: ', error);
            }
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      id: 1,
      title: 'Transaction History',
      subtitle: 'View all your tip transactions',
      icon: require('../assets/topups.png'),
      onPress: handleTransactions,
      color: '#4ECDC4',
    },
    {
      id: 2,
      title: 'Withdrawal History',
      subtitle: 'Track your withdrawal records',
      icon: require('../assets/withdraws.png'),
      onPress: handleWithdraw,
      color: '#45B7D1',
    },
    {
      id: 3,
      title: 'Security Settings',
      subtitle: 'Manage your secret PIN',
      icon: require('../assets/pin.png'),
      onPress: handleNavigateSecretPage,
      color: '#F39C12',
    },
    {
      id: 4,
      title: 'Logout',
      subtitle: 'Sign out of your account',
      icon: require('../assets/quit.png'),
      onPress: handleLogout,
      color: '#E74C3C',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <Animatable.View  style={styles.header}>
          {/* <Text style={styles.headerTitle}>Profile</Text> */}
        </Animatable.View>

        {/* Profile Section */}
        <Animatable.View  delay={200} style={styles.profileSection}>
          <View style={styles.profileCard}>
            <View style={styles.profileImageContainer}>
              {userInitials ? (
                <View style={styles.initialsContainer}>
                  <Text style={styles.initialsText}>{userInitials}</Text>
                </View>
              ) : (
                <Image source={require('../assets/users.png')} style={styles.profileImage} />
              )}
              <View style={styles.onlineIndicator} />
            </View>
            
            <View style={styles.profileInfo}>
              <Text style={styles.userName}>{userName || 'User Name'}</Text>
              <Text style={styles.userEmail}>{emailname || 'user@example.com'}</Text>
              <View style={styles.membershipBadge}>
                <Text style={styles.membershipText}>Active</Text>
              </View>
            </View>
          </View>
        </Animatable.View>

        {/* Menu Items */}
        <Animatable.View  delay={400} style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Account Settings</Text>
          
          {menuItems.map((item, index) => (
            <Animatable.View
              key={item.id}
              delay={10 + (index * 10)}
            >
              <TouchableOpacity
                style={styles.menuItem}
                onPress={item.onPress}
                activeOpacity={1}
              >
                <View style={styles.menuItemLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: `${item.color}15` }]}>
                    <Image 
                      source={item.icon} 
                      style={[styles.menuIcon, { tintColor: item.color }]} 
                    />
                  </View>
                  <View style={styles.menuTextContainer}>
                    <Text style={styles.menuTitle}>{item.title}</Text>
                    <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                  </View>
                </View>
                <View style={styles.chevronContainer}>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </TouchableOpacity>
            </Animatable.View>
          ))}
        </Animatable.View>

        {/* App Info */}
        <Animatable.View animation="fadeIn" delay={1000} style={styles.appInfo}>
          <Text style={styles.appVersion}>Golden Tie Tipping</Text>
          <Text style={styles.appDescription}>
            Secure and convenient tipping platform
          </Text>
        </Animatable.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  profileSection: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    elevation: 2,
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  initialsContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4ECDC4',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  profileInfo: {
    alignItems: 'center',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 12,
  },
  membershipBadge: {
    backgroundColor: 'green',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  membershipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  menuSection: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  menuItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    // shadowOffset: {
    //   width: 0,
    //   height: 2,
    // },
    // shadowOpacity: 0.05,
    // shadowRadius: 4,
    elevation: 1,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuIcon: {
    width: 20,
    height: 20,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  menuSubtitle: {
    fontSize: 14,
    color: '#666666',
  },
  chevronContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevron: {
    fontSize: 20,
    color: '#CCCCCC',
    fontWeight: '300',
  },
  appInfo: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  appVersion: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    marginBottom: 4,
  },
  appDescription: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
  },
});