// import React, { useEffect, useState } from 'react';
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
// import setNavigationColor from 'react-native-navigation-bar-color';
// import { useNavigation } from '@react-navigation/native';
// import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
// import type { RootStackParamList } from '../screens/types';

// const slides = [
//   {
//     image: require('../assets/pg2.png'),
//     text: 'TRACK YOUR SPENDING',
//   },
//   {
//     image: require('../assets/pg3.png'),
//     text: 'MANAGE YOUR PERSONAL FINANCES',
//   },
//   {
//     image: require('../assets/pg1.png'),
//     text: 'PLAN FOR THE FUTURE',
//   },
// ];

// const OnboardingScreen = () => {
//   const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
//   const [currentIndex, setCurrentIndex] = useState(0);

//   useEffect(() => {
//     if (Platform.OS === 'android') {
//       setNavigationColor('transparent', false, true);
//     }
//   }, []);

//   return (
//     <View style={styles.container}>
//       <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

//       {/* Swiper with logo and dynamic subtitle */}
//       <Swiper
//         loop={false}
//         onIndexChanged={(index) => setCurrentIndex(index)}
//         dotColor="rgba(255,255,255,0.5)"
//         activeDotColor="#fff"
//         paginationStyle={styles.pagination}
//       >
//         {slides.map((slide, index) => (
//         <ImageBackground
//   key={index}
//   source={slide.image}
//   style={styles.background}
//   resizeMode="cover"
// >
//   <View style={styles.overlay}>
//     <View style={styles.logoContainer}>
//       <Image source={require('../assets/logos.png')} style={styles.logo} />
//     </View>

//     <View style={styles.subtitleContainer}>
//       <Text style={styles.subtitle}>{slide.text}</Text>
//     </View>
//   </View>
// </ImageBackground>
//         ))}
//       </Swiper>

//       {/* Static Sign In Button */}
//       <View style={styles.buttonContainer}>
//         <TouchableOpacity style={styles.button} onPress={() => navigation.replace('Login')}>
//           <Text style={styles.buttonText}>SIGN IN</Text>
//           <Image
//             source={require('../assets/chevron1.png')}
//             style={[styles.icon, { width: 24, height: 24 }]}
//           />
//         </TouchableOpacity>
//       </View>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//   },
//   background: {
//     flex: 1,
//     width: '100%',
//     height: '100%',
//   },
//  overlay: {
//   flex: 1,
//   paddingHorizontal: 20,
//   backgroundColor: 'rgba(0, 0, 0, 0.2)',
// },



// logo: {
//   height: 80,
//   resizeMode: 'contain',
// },


// logoContainer: {
//   alignItems: 'center',
//   marginTop: Platform.OS === 'android' ? 60 : 80,  // your existing margin top for logo
// },


// subtitleContainer: {
//   flex: 1,
//   justifyContent: 'center',
//   alignItems: 'center',
// },
// subtitle: {
//   color: '#fff',
//   fontSize: 18,
//   textAlign: 'center',
//   paddingHorizontal: 10,
// },
//   pagination: {
//     bottom: 160,
//   },
//   buttonContainer: {
//     position: 'absolute',
//     bottom: 100,
//     left: 0,
//     right: 0,
//     alignItems: 'center',
//   },
//   button: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     backgroundColor: '#00A94F',
//     paddingVertical: 12,
//     paddingHorizontal: 30,
//     borderRadius: 10,
//     width: '80%',
//     justifyContent: 'center',
//   },
//   buttonText: {
//     color: '#fff',
//     fontSize: 16,
//     fontWeight: 'bold',
//   },
//   icon: {
//     marginLeft: 10,
//   },
// });

// export default OnboardingScreen;
