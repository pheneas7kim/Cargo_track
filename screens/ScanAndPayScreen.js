// my code import React, { useState, useEffect, useCallback } from 'react';
// import {
//   View,
//   Text,
//   StyleSheet,
//   Alert,
//   PermissionsAndroid,
//   Platform,
//   TouchableOpacity,
// } from 'react-native';
// import QRCodeScanner from 'react-native-qrcode-scanner';
// import { RNCamera as Camera } from 'react-native-camera';
// import Icon from 'react-native-vector-icons/Ionicons';

// export default function QrScanScreen({ navigation }) {
//   const [hasPermission, setHasPermission] = useState(false);
//   const [scanning, setScanning] = useState(true);

//   /** ✅ Request camera permission */
//   useEffect(() => {
//     const requestPermission = async () => {
//       if (Platform.OS === 'android') {
//         const granted = await PermissionsAndroid.request(
//           PermissionsAndroid.PERMISSIONS.CAMERA
//         );
//         setHasPermission(granted === PermissionsAndroid.RESULTS.GRANTED);
//       } else {
//         setHasPermission(true);
//       }
//     };
//     requestPermission();
//   }, []);

//   /** ✅ Handle successful QR scan */
//   const onScanSuccess = useCallback(
//     (e) => {
//       if (!scanning || !e?.data) return;

//       setScanning(false);
//       const code = e.data;

//       // Show scanned code
//       Alert.alert('QR Code Scanned', `Scanned Data: ${code}`, [
//         {
//           text: 'Pay Now',
//           onPress: () => {
//             // Example navigation with data
//             navigation?.navigate('PaymentScreen', { code });
//           },
//         },
//         {
//           text: 'Scan Again',
//           onPress: () => setScanning(true),
//           style: 'cancel',
//         },
//       ]);
//     },
//     [scanning, navigation]
//   );

//   if (!hasPermission)
//     return (
//       <View style={styles.permissionContainer}>
//         <Text style={styles.permissionText}>Requesting Camera Permission...</Text>
//       </View>
//     );

//   return (
//     <View style={styles.container}>
//       <QRCodeScanner
//         // onRead={onScanSuccess}
//         reactivate={false}
//         flashMode={RNCamera.Constants.FlashMode.auto}
//         showMarker={true}
//         cameraStyle={styles.camera}
//         customMarker={
//           <View style={styles.markerContainer}>
//             <View style={styles.markerBorder} />
//             <Text style={styles.markerText}>Align the QR code inside the box</Text>
//           </View>
//         }
//       />

//       <TouchableOpacity
//         style={styles.backButton}
//         onPress={() => navigation?.goBack()}>
//         <Icon name="arrow-back" size={28} color="#fff" />
//       </TouchableOpacity>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: '#000' },
//   camera: { flex: 1, height: '100%' },

//   permissionContainer: {
//     flex: 1,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   permissionText: {
//     color: '#333',
//     fontSize: 16,
//   },

//   markerContainer: {
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   markerBorder: {
//     width: 250,
//     height: 250,
//     borderWidth: 3,
//     borderColor: '#00BFFF',
//     borderRadius: 12,
//   },
//   markerText: {
//     color: 'white',
//     fontSize: 16,
//     marginTop: 20,
//     backgroundColor: 'rgba(0,0,0,0.6)',
//     padding: 8,
//     borderRadius: 8,
//   },
//   backButton: {
//     position: 'absolute',
//     top: 40,
//     left: 20,
//     backgroundColor: 'rgba(0,0,0,0.5)',
//     padding: 8,
//     borderRadius: 50,
//   },
// }); 