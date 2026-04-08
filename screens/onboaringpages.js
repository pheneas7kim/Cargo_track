// import React from 'react';
// import { useEffect } from 'react';
// import setNavigationColor from 'react-native-navigation-bar-color';



// import {
//   View,
//   Text,
//   StyleSheet,
//   Image,
//   ImageBackground,
//   TouchableOpacity,
//   StatusBar,
//   Platform,
// } from 'react-native';
// import Swiper from 'react-native-swiper';
// import Icon from 'react-native-vector-icons/Ionicons';
// import { useNavigation } from '@react-navigation/native';

// import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
// import type { RootStackParamList } from 'screens/types'; // 

// const OnboardingScreens = () => {
//     const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();


//     useEffect(() => {
//       if (Platform.OS === 'android') {
//         setNavigationColor('transparent', false, true);
//       }
//     }, []);

 

//   return (
//     <View style={styles.container}>
//       <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

//       <Swiper
//         loop={false}
//         dotColor="rgba(255,255,255,0.5)"
//         activeDotColor="#fff"
//         paginationStyle={styles.pagination}
//       >
//         {/* Slide */}
//         <ImageBackground
//           source={require('../assets/pg2.png')} // replace with your image
//           style={styles.background}
//           resizeMode="cover"
//         >
//           <View style={styles.overlay}>
//             <Image source={require('../assets/logos.png')} style={styles.logo} />
//             <Text style={styles.subtitle}>MANAGE YOUR PERSONAL FINANCES</Text>

//             <TouchableOpacity style={styles.button} onPress={() => navigation.replace('Login')}>
//               <Text style={styles.buttonText}>SIGN IN</Text>
//               <Icon name="arrow-forward" size={20} color="#fff" style={styles.icon} />
//             </TouchableOpacity>
//           </View>
//         </ImageBackground>
//       </Swiper>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: 'transparent',
//   },
//   background: {
//     flex: 1,
//     width: '100%',
//     height: '100%',
//   },
//   overlay: {
//     flex: 1,
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     paddingTop: 60,
//     paddingBottom: Platform.OS === 'android' ? 60 : 40,
//     backgroundColor: 'rgba(0, 0, 0, 0.2)',
//   },
//   logo: {
//     height: 100,
//     resizeMode: 'contain',
//     marginTop: Platform.OS === 'android' ? 40 : 60,
//   },
//   subtitle: {
//     color: '#fff',
//     fontSize: 16,
//     marginBottom: 10,
//     textAlign: 'center',
//   },
//   button: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center', // ✅ Add this line
//     backgroundColor: '#00A94F',
//     paddingVertical: 12,
//     paddingHorizontal: 30,
//     borderRadius: 10,
//     marginBottom: 20,
//     width: '80%',
//   },
  
//   buttonText: {
//     color: '#fff',
//     fontSize: 16,
//     fontWeight: 'bold',
//   },
//   icon: {
//     marginLeft: 10,
//   },
//   pagination: {
//     bottom: 120,
//   },
// });

// export default OnboardingScreens;
